import os

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "qx_market.api:app",
        host="127.0.0.1",
        port=int(os.getenv("QX_MARKET_API_PORT", "8000")),
        reload=False,
    )
