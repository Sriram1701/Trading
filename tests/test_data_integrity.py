import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

import step2_data_prep
from step2_data_prep import create_synthetic_sample_data, validate_ohlcv
from step3_train_model import load_and_prepare_dataset


def valid_market_data(rows=3):
    timestamps = pd.date_range("2025-01-01T00:00:00Z", periods=rows, freq="min")
    return pd.DataFrame({
        "timestamp": timestamps,
        "open": [100.0] * rows,
        "high": [101.0] * rows,
        "low": [99.0] * rows,
        "close": [100.5] * rows,
        "volume": [10] * rows,
        "source": ["yfinance"] * rows,
    })


class ValidateOhlcvTests(unittest.TestCase):
    def test_missing_market_data_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "empty"):
            validate_ohlcv(pd.DataFrame())

    def test_missing_provenance_is_rejected(self):
        data = valid_market_data().drop(columns=["source"])
        with self.assertRaisesRegex(ValueError, "source"):
            validate_ohlcv(data)

    def test_duplicate_timestamps_are_rejected(self):
        data = valid_market_data()
        data.loc[2, "timestamp"] = data.loc[1, "timestamp"]
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_ohlcv(data)

    def test_missing_minute_candles_are_rejected(self):
        data = valid_market_data()
        data.loc[2, "timestamp"] += pd.Timedelta(minutes=1)
        with self.assertRaisesRegex(ValueError, "missing or non-minute"):
            validate_ohlcv(data)

    def test_invalid_ohlc_relationship_is_rejected(self):
        data = valid_market_data()
        data.loc[1, "high"] = 99.0
        with self.assertRaisesRegex(ValueError, "invalid OHLC"):
            validate_ohlcv(data)

    def test_synthetic_source_cannot_enter_training(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.csv"
            synthetic = create_synthetic_sample_data(40)
            synthetic.to_csv(path, index=False)
            with self.assertRaisesRegex(ValueError, "Synthetic data"):
                load_and_prepare_dataset(str(path))

    def test_real_data_failure_stops_without_synthetic_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "features.csv"
            args = ["step2_data_prep.py", "--source", "auto", "--output", str(output)]
            with patch("sys.argv", args), \
                    patch.object(step2_data_prep, "fetch_data_yfinance", side_effect=RuntimeError("feed unavailable")), \
                    patch.object(step2_data_prep, "create_synthetic_sample_data") as synthetic:
                with self.assertRaisesRegex(RuntimeError, "feed unavailable"):
                    step2_data_prep.main()
            synthetic.assert_not_called()
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
