from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from qx_market.analysis import analyze_candles
from qx_market.models import MarketType
from qx_market.providers.base import ProviderError, ProviderRateLimited
from qx_market.service import MarketDataService

LOCAL_UI_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


def create_app(service: MarketDataService | None = None) -> FastAPI:
    data_service = service or MarketDataService()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        data_service.initialize()
        yield

    app = FastAPI(
        title="QX Read-Only Market Data API",
        version="1.0.0",
        description="Read-only provider data; no broker or order endpoints.",
        lifespan=lifespan,
    )
    app.state.market_data_service = data_service
    app.add_middleware(
        CORSMiddleware,
        allow_origins=LOCAL_UI_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept"],
    )

    @app.get("/api/v1/health")
    def health():
        return {
            "status": "ok",
            "service": "read-only-market-data",
            "database": str(data_service.database.path),
        }

    @app.get("/api/v1/data-sources")
    def data_sources():
        return {
            "sources": [{
                "provider": data_service.provider.provider_id,
                "name": "Binance Spot public REST API",
                "market_types": ["REGULAR"],
                "asset_categories": ["CRYPTO"],
                "credential_required": False,
                "status": "CONFIGURED",
                "limitations": [
                    "Crypto spot only; no Forex, metals, indices, Quotex, or OTC mapping.",
                    "Public API rate limits apply.",
                    "Price data is exchange-specific and is not Quotex broker pricing.",
                ],
            }, {
                "provider": "otc_screen_capture",
                "name": "User-selected screen capture",
                "market_types": ["OTC"],
                "asset_categories": [],
                "credential_required": False,
                "status": "UNVERIFIED",
                "limitations": ["Screen pixels are not normalized into OHLC candles."],
            }],
        }

    @app.get("/api/v1/categories")
    def categories(market_type: MarketType = MarketType.REGULAR):
        try:
            values = data_service.categories(market_type)
        except ProviderRateLimited as error:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "PROVIDER_RATE_LIMITED",
                    "message": str(error),
                    "retry_after_seconds": error.retry_after_seconds,
                },
            ) from error
        except ProviderError as error:
            raise HTTPException(
                status_code=502,
                detail={"code": "PROVIDER_UNAVAILABLE", "message": str(error)},
            ) from error
        return {"market_type": market_type.value, "categories": list(values)}

    @app.get("/api/v1/assets")
    def assets(
        market_type: MarketType = MarketType.REGULAR,
        category: str | None = None,
        refresh: bool = False,
    ):
        try:
            values = data_service.list_assets(market_type, category, refresh)
        except ProviderRateLimited as error:
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "PROVIDER_RATE_LIMITED",
                    "message": str(error),
                    "retry_after_seconds": error.retry_after_seconds,
                },
            ) from error
        except ProviderError as error:
            raise HTTPException(
                status_code=502,
                detail={"code": "PROVIDER_UNAVAILABLE", "message": str(error)},
            ) from error
        return {
            "market_type": market_type.value,
            "category": category or "ALL",
            "retrieved_at": values[0].last_updated_at.isoformat().replace("+00:00", "Z") if values else None,
            "count": len(values),
            "diagnostics": (
                ["OTC_DATA_UNVERIFIED: no OTC assets are published by the configured source."]
                if market_type is MarketType.OTC else []
            ),
            "assets": [asset.to_dict() for asset in values],
        }

    @app.get("/api/v1/market-data")
    def market_data(
        market_type: MarketType = MarketType.REGULAR,
        asset_id: str | None = None,
        timeframe: str = Query("1m", min_length=2, max_length=3),
        limit: int = Query(200, ge=2, le=1000),
    ):
        if timeframe not in data_service.provider.supported_timeframes:
            raise HTTPException(
                status_code=422,
                detail={"code": "TIMEFRAME_UNSUPPORTED", "message": f"Unsupported timeframe: {timeframe}."},
            )
        return data_service.market_data(market_type, asset_id, timeframe, limit).to_dict()

    @app.get("/api/v1/analysis")
    def analysis(
        market_type: MarketType = MarketType.REGULAR,
        asset_id: str | None = None,
        timeframe: str = Query("1m", min_length=2, max_length=3),
        limit: int = Query(200, ge=2, le=1000),
    ):
        if timeframe not in data_service.provider.supported_timeframes:
            raise HTTPException(
                status_code=422,
                detail={"code": "TIMEFRAME_UNSUPPORTED", "message": f"Unsupported timeframe: {timeframe}."},
            )
        base = data_service.market_data(market_type, asset_id, timeframe, limit).to_dict()
        base["analysis"] = analyze_candles(
            base["candles"],
            market_type=market_type.value,
            data_quality_status=base["data_quality_status"],
            decision_code=base["decision_code"],
        )
        base["multi_timeframe"] = {}
        if market_type is MarketType.REGULAR and timeframe == "1m" and base["asset"] is not None:
            for higher_timeframe in ("5m", "15m", "1h"):
                higher = data_service.market_data(
                    market_type, asset_id, higher_timeframe, min(limit, 200)
                ).to_dict()
                higher_analysis = analyze_candles(
                    higher["candles"],
                    market_type=market_type.value,
                    data_quality_status=higher["data_quality_status"],
                    decision_code=higher["decision_code"],
                )
                base["multi_timeframe"][higher_timeframe] = {
                    "decision": "WAIT",
                    "decision_code": higher["decision_code"],
                    "retrieval_timestamp": higher["retrieval_timestamp"],
                    "data_quality_status": higher["data_quality_status"],
                    "market_condition": higher_analysis["market_condition"],
                    "ema_alignment": higher_analysis["indicators"].get("ema_alignment", "UNAVAILABLE"),
                    "diagnostics": higher["diagnostics"] + higher_analysis["diagnostics"],
                }
        base["decision"] = "WAIT"
        base["decision_code"] = base["analysis"]["decision_code"]
        return base

    return app


app = create_app()
