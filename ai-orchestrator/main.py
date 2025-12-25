from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import json
import google.generativeai as genai

app = FastAPI(title="AI Orchestrator", version="1.0.0")

# CORS: Only allow specific origins, not wildcard with credentials
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
REQUEST_TIMEOUT_SEC = int(os.getenv("REQUEST_TIMEOUT_SEC", "60"))
SERVICE_TOKEN = os.getenv("SERVICE_TOKEN")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is required")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


# Dependency to verify service token
async def verify_service_token(x_service_token: str = Header(None)):
    if SERVICE_TOKEN and x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid service token")
    return True


class Step(BaseModel):
    index: int = Field(..., description="Step number (1-indexed)")
    text: str = Field(..., description="Step instruction text")
    timestamp_sec: int = Field(..., description="Timestamp in seconds (0 if unknown)")


class ExtractRequest(BaseModel):
    source_type: str = Field(..., description="Source type (e.g., 'youtube')")
    source_ref: str = Field(..., description="Source reference (e.g., YouTube URL)")
    transcript: str = Field(..., description="Raw transcript text")
    options: Optional[dict] = Field(default={}, description="Extraction options")


class ExtractResponse(BaseModel):
    title: str
    description: Optional[str] = None
    ingredients: List[str]
    steps: List[Step]


SYSTEM_PROMPT = """You are a recipe extraction assistant. Your task is to extract structured recipe information from a video transcript.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no backticks, no explanations.
2. The JSON must match this exact schema:
{
  "title": "Recipe Title",
  "description": "Optional description",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "steps": [
    {"index": 1, "text": "Step instruction", "timestamp_sec": 123},
    {"index": 2, "text": "Step instruction", "timestamp_sec": 456},
    ...
  ]
}

3. Ingredients must be an array of strings. Each string should be a complete ingredient with quantity if mentioned (e.g., "2 cups flour", "1 tablespoon olive oil").

4. Steps must be an array of objects with:
   - index: sequential number starting from 1
   - text: concise step instruction
   - timestamp_sec: integer seconds from video start (round to nearest second)

5. TIMESTAMP EXTRACTION IS CRITICAL: The transcript lines are formatted as "[XX.XXs] text content".
   - Pick timestamps ONLY from the timestamps shown in the transcript lines (the numbers in brackets).
   - For each step, find the transcript line(s) that best match that step and use the timestamp from those lines.
   - If a step corresponds to multiple transcript lines, use the earliest timestamp.
   - Round timestamps to the nearest integer second.
   - DO NOT invent or guess timestamps - only use timestamps that appear in the transcript format [XX.XXs].

6. Steps should be clear, actionable cooking instructions. Combine related actions into single steps when appropriate.

7. If the transcript doesn't contain a recipe, return an error in the description field explaining why.

Output ONLY the JSON object, nothing else."""


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-orchestrator"}


@app.post("/extract", response_model=ExtractResponse, dependencies=[Depends(verify_service_token)])
async def extract_recipe(request: ExtractRequest):
    """
    Extract structured recipe from transcript using OpenAI.
    """
    try:
        user_prompt = f"""Extract recipe information from this video transcript.

Video URL: {request.source_ref}

Transcript (with timestamps in [XX.XXs] format):
{request.transcript}

Extract the recipe title, ingredients list, and cooking steps with timestamps. 
IMPORTANT: Pick timestamps ONLY from the timestamps shown in the transcript lines (the [XX.XXs] format). 
Do not invent timestamps - use the exact timestamps from the transcript that correspond to each step.

Output as JSON matching the required schema."""

        # Gemini uses a single prompt with system instruction
        full_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}\n\nRemember: Output ONLY valid JSON matching the schema, no markdown or explanations."

        try:
            response = model.generate_content(
                full_prompt,
                generation_config={
                    "temperature": 0.3,
                },
            )
            content = response.text
        except Exception as e:
            raise ValueError(f"Gemini API error: {str(e)}")

        # Parse JSON response
        try:
            # Strip markdown code fences if present
            cleaned_content = content.strip()
            if cleaned_content.startswith('```json'):
                cleaned_content = cleaned_content[7:]
            elif cleaned_content.startswith('```'):
                cleaned_content = cleaned_content[3:]
            if cleaned_content.endswith('```'):
                cleaned_content = cleaned_content[:-3]
            cleaned_content = cleaned_content.strip()
            
            recipe_data = json.loads(cleaned_content)
        except json.JSONDecodeError as e:
            # Try to extract JSON from markdown if present
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                try:
                    recipe_data = json.loads(json_match.group())
                except json.JSONDecodeError:
                    # Retry with repair prompt - include original context
                    repair_prompt = f"{SYSTEM_PROMPT}\n\n{user_prompt}\n\nThe previous response was invalid JSON. Return ONLY valid JSON matching the schema, no markdown or explanations."
                    try:
                        repair_response = model.generate_content(
                            repair_prompt,
                            generation_config={
                                "temperature": 0.1,
                            },
                        )
                        recipe_data = json.loads(repair_response.text.strip())
                    except Exception:
                        raise ValueError(f"Invalid JSON response after repair attempt: {e}")
            else:
                raise ValueError(f"Invalid JSON response: {e}")

        # Validate and transform response
        if "title" not in recipe_data:
            raise ValueError("Missing 'title' in response")
        if "ingredients" not in recipe_data or not isinstance(recipe_data["ingredients"], list):
            raise ValueError("Missing or invalid 'ingredients' in response")
        if "steps" not in recipe_data or not isinstance(recipe_data["steps"], list):
            raise ValueError("Missing or invalid 'steps' in response")

        # Validate steps structure
        validated_steps = []
        ingredients_list = recipe_data.get("ingredients", [])
        steps_list = recipe_data.get("steps", [])

        # Handle empty recipe case (error in description)
        if not ingredients_list or not steps_list:
            error_desc = recipe_data.get("description", "No recipe found in transcript")
            if "error" in error_desc.lower() or "no recipe" in error_desc.lower():
                raise HTTPException(
                    status_code=422,
                    detail=f"Recipe extraction failed: {error_desc}",
                )

        for i, step in enumerate(steps_list):
            if not isinstance(step, dict):
                raise ValueError(f"Step {i+1} is not an object")
            if "index" not in step or "text" not in step or "timestamp_sec" not in step:
                raise ValueError(f"Step {i+1} missing required fields")
            validated_steps.append(
                Step(
                    index=int(step["index"]),
                    text=str(step["text"]),
                    timestamp_sec=int(step.get("timestamp_sec", 0)),
                )
            )

        return ExtractResponse(
            title=str(recipe_data["title"]),
            description=recipe_data.get("description"),
            ingredients=[str(ing) for ing in ingredients_list],
            steps=validated_steps,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid response format: {str(e)}",
        )
    except HTTPException:
        raise  # Re-raise HTTPException as-is
    except Exception as e:
        error_str = str(e).lower()
        if "api" in error_str or "gemini" in error_str:
            raise HTTPException(
                status_code=503,
                detail=f"Gemini API error: {str(e)}",
            )
        raise HTTPException(
            status_code=500,
            detail=f"Internal error: {str(e)}",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)

