"""
==============================================================================
Step 3: Machine Learning Model Training (1-Minute Next Candle Predictor)
==============================================================================
Trains a Machine Learning model (Random Forest or XGBoost) to predict whether
the NEXT 1-minute candle will close UP (1) or DOWN (0) using historical indicator 
features (RSI, EMA spread/cross, MACD, Bollinger Bands, ATR, Candle patterns).

Performs:
- Chronological 80% Train / 20% Test split (prevents future lookahead bias)
- Feature standardization
- Multi-model evaluation (Random Forest & XGBoost)
- Accuracy, Precision, Recall, F1, Confusion Matrix & Feature Importance
- Model persistence via joblib

Usage:
    uv run python step3_train_model.py
    or
    python step3_train_model.py --data cad_jpy_1m_features.csv --model-type xgboost
==============================================================================
"""

import argparse
import logging
import os
import sys
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score
)
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("TrainML")


def load_and_prepare_dataset(csv_path: str = "cad_jpy_1m_features.csv"):
    """
    Loads features CSV and sets up Target variable for next 1-minute candle.
    Target: 1 if Next Close > Current Close (or Next Close > Next Open), else 0.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset file '{csv_path}' not found. Please run step2_data_prep.py first.")

    df = pd.read_csv(csv_path)
    logger.info(f"Loaded {len(df)} rows from {csv_path}.")

    # Define Target: Next 1-minute candle direction (Up = 1, Down = 0)
    df["target"] = np.where(df["close"].shift(-1) > df["close"], 1, 0)
    
    # Drop the last row because shift(-1) creates a NaN / untargetable boundary
    df = df.iloc[:-1].copy()

    # Define candidate feature columns
    excluded_cols = ["timestamp", "open", "high", "low", "close", "volume", "target"]
    feature_cols = [c for c in df.columns if c not in excluded_cols and pd.api.types.is_numeric_dtype(df[c])]

    logger.info(f"Using {len(feature_cols)} features: {feature_cols}")
    return df, feature_cols


def split_time_series(df: pd.DataFrame, feature_cols: list, train_ratio: float = 0.8):
    """
    Splits data chronologically (train on first 80%, test on most recent 20%).
    Crucial for financial time-series to avoid future data leakage.
    """
    split_idx = int(len(df) * train_ratio)
    
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]

    X_train = train_df[feature_cols].values
    y_train = train_df["target"].values

    X_test = test_df[feature_cols].values
    y_test = test_df["target"].values

    logger.info(f"Train Set: {len(X_train)} samples ({train_df['timestamp'].iloc[0]} to {train_df['timestamp'].iloc[-1]})")
    logger.info(f"Test Set:  {len(X_test)} samples ({test_df['timestamp'].iloc[0]} to {test_df['timestamp'].iloc[-1]})")

    # Class balance check
    logger.info(f"Train Target Balance: Up={np.mean(y_train==1):.2%}, Down={np.mean(y_train==0):.2%}")
    logger.info(f"Test Target Balance:  Up={np.mean(y_test==1):.2%}, Down={np.mean(y_test==0):.2%}")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    return X_train_scaled, X_test_scaled, y_train, y_test, scaler


def build_model(model_type: str = "xgboost"):
    """Initialize Random Forest or XGBoost model with optimized hyper-parameters for scalping."""
    if model_type == "xgboost":
        try:
            from xgboost import XGBClassifier
            logger.info("Initializing XGBoost Classifier...")
            return XGBClassifier(
                n_estimators=200,
                max_depth=5,
                learning_rate=0.03,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                eval_metric="logloss",
                use_label_encoder=False
            )
        except ImportError:
            logger.warning("XGBoost library not found. Falling back to GradientBoostingClassifier...")
            return GradientBoostingClassifier(
                n_estimators=150,
                max_depth=4,
                learning_rate=0.03,
                subsample=0.8,
                random_state=42
            )
    else:
        logger.info("Initializing Random Forest Classifier...")
        return RandomForestClassifier(
            n_estimators=250,
            max_depth=8,
            min_samples_split=6,
            min_samples_leaf=4,
            max_features="sqrt",
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        )


def evaluate_model(model, X_train, X_test, y_train, y_test, feature_cols):
    """Calculates and prints comprehensive evaluation metrics."""
    # Predictions
    y_train_pred = model.predict(X_train)
    y_test_pred = model.predict(X_test)
    y_test_prob = model.predict_proba(X_test)[:, 1] if hasattr(model, "predict_proba") else None

    # Scores
    train_acc = accuracy_score(y_train, y_train_pred)
    test_acc = accuracy_score(y_test, y_test_pred)
    precision = precision_score(y_test, y_test_pred, zero_division=0)
    recall = recall_score(y_test, y_test_pred, zero_division=0)
    f1 = f1_score(y_test, y_test_pred, zero_division=0)
    roc_auc = roc_auc_score(y_test, y_test_prob) if y_test_prob is not None else 0.0

    print("\n" + "=" * 60)
    print(" 🎯 MODEL EVALUATION RESULTS (1-Min Next Candle Direction)")
    print("=" * 60)
    print(f"🔹 Training Accuracy:   {train_acc * 100:.2f}%")
    print(f"🔹 Test Accuracy:       {test_acc * 100:.2f}%")
    print(f"🔹 Precision (Up=1):    {precision * 100:.2f}%")
    print(f"🔹 Recall (Up=1):       {recall * 100:.2f}%")
    print(f"🔹 F1-Score:            {f1 * 100:.2f}%")
    if y_test_prob is not None:
        print(f"🔹 ROC-AUC Score:       {roc_auc:.4f}")
    
    print("\n--- Confusion Matrix ---")
    cm = confusion_matrix(y_test, y_test_pred)
    tn, fp, fn, tp = cm.ravel()
    print(f"                Predicted DOWN (0)   Predicted UP (1)")
    print(f"Actual DOWN (0)       {tn:<18}     {fp:<18}")
    print(f"Actual UP   (1)       {fn:<18}     {tp:<18}")

    print("\n--- Classification Report ---")
    print(classification_report(y_test, y_test_pred, target_names=["DOWN (0)", "UP (1)"], digits=4))

    # Feature Importance
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
        fi_df = pd.DataFrame({
            "Feature": feature_cols,
            "Importance": importances
        }).sort_values("Importance", ascending=False)
        print("\n--- Top 10 Most Influential Indicator Features ---")
        for i, row in fi_df.head(10).reset_index().iterrows():
            bar = "█" * int(row["Importance"] * 80)
            print(f"{i+1:2d}. {row['Feature']:<16} : {row['Importance']:.4f} {bar}")

    metrics = {
        "train_accuracy": train_acc,
        "test_accuracy": test_acc,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "roc_auc": roc_auc
    }
    return metrics


def main():
    parser = argparse.ArgumentParser(description="Train CAD/JPY 1-Min ML Predictor")
    parser.add_argument("--data", type=str, default="cad_jpy_1m_features.csv", help="Input features CSV")
    parser.add_argument("--model-type", type=str, choices=["xgboost", "random_forest"], default="xgboost", help="ML model algorithm")
    parser.add_argument("--output", type=str, default="cad_jpy_model.joblib", help="Output model path")
    args = parser.parse_args()

    # 1. Load Data
    df, feature_cols = load_and_prepare_dataset(args.data)

    # 2. Time-Series Split
    X_train, X_test, y_train, y_test, scaler = split_time_series(df, feature_cols, train_ratio=0.8)

    # 3. Build & Train Model
    model = build_model(args.model_type)
    logger.info(f"Training {args.model_type} model on {len(X_train)} samples...")
    model.fit(X_train, y_train)

    # 4. Evaluate
    metrics = evaluate_model(model, X_train, X_test, y_train, y_test, feature_cols)

    # 5. Save Artifacts Bundle
    model_bundle = {
        "model": model,
        "model_type": args.model_type,
        "scaler": scaler,
        "feature_cols": feature_cols,
        "metrics": metrics,
        "target_description": "Next 1-minute candle close direction (1=UP, 0=DOWN)"
    }
    joblib.dump(model_bundle, args.output)
    logger.info(f"✅ Model successfully saved to '{args.output}'")


if __name__ == "__main__":
    main()
