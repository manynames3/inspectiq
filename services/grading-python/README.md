# InspectIQ Python Grading Service

Small optional service boundary for repeatable condition grading rules.

The Node API can call this service through `GRADING_SERVICE_URL`. If it is not running, the API uses the equivalent in-process fallback so the inspection workflow remains reliable for local development and demos.

## Run

```bash
cd services/grading-python
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Test

```bash
cd services/grading-python
python -m pip install -r requirements.txt
python -m pytest
```

## Contract

`POST /grade`

Input:

```json
{
  "vehicle": { "year": 2024, "mileage": 14250 },
  "requiredPhotoCompletion": 1,
  "damageItems": [
    { "location": "front bumper", "damageType": "scratch", "severity": "minor" }
  ]
}
```

Output:

```json
{
  "score": 97,
  "grade": "A",
  "explanation": {
    "baseScore": 100,
    "deductions": [{ "reason": "minor scratch on front bumper", "points": 3 }],
    "completionPenalty": 0,
    "mileageAdjustment": 0,
    "ageAdjustment": 0
  },
  "gradingVersion": "grading-rules-v1-python"
}
```
