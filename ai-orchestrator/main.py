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
if not SERVICE_TOKEN:
    raise ValueError("SERVICE_TOKEN environment variable is required for service-to-service authentication")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


# Dependency to verify service token
async def verify_service_token(x_service_token: Optional[str] = Header(None)):
    if SERVICE_TOKEN:
        if not x_service_token:
            raise HTTPException(status_code=401, detail="Service token header missing")
        if x_service_token != SERVICE_TOKEN:
            raise HTTPException(status_code=401, detail="Invalid service token")
    return True


class Step(BaseModel):
    index: int = Field(..., description="Step number (1-indexed)")
    text: str = Field(..., description="Step instruction text")
    timestamp_sec: int = Field(..., description="Timestamp in seconds (0 if unknown)")


class Ingredient(BaseModel):
    qty: str = Field(..., description="Quantity as decimal string (e.g., '0.5', '2.5') or descriptive string (e.g., 'To taste', 'As required')")
    unit: str = Field(..., description="Unit of measurement (e.g., 'cup', 'tsp', '')")
    item: str = Field(..., description="Ingredient name/description excluding qty/unit")


class ExtractRequest(BaseModel):
    source_type: str = Field(..., description="Source type (e.g., 'youtube')")
    source_ref: str = Field(..., description="Source reference (e.g., YouTube URL)")
    transcript: str = Field(..., description="Raw transcript text")
    options: Optional[dict] = Field(default={}, description="Extraction options")


class ExtractResponse(BaseModel):
    title: str
    description: Optional[str] = None
    ingredients: List[Ingredient]
    steps: List[Step]


class ChatStep(BaseModel):
    text: str = Field(..., description="Step instruction text")
    index: Optional[int] = Field(None, description="Step number (1-indexed, optional)")


class ChatRequest(BaseModel):
    recipe_id: str = Field(..., description="Recipe ID")
    title: str = Field(..., description="Recipe title")
    description: Optional[str] = Field(None, description="Recipe description")
    ingredients: List[Ingredient] = Field(..., description="Recipe ingredients")
    steps: List[ChatStep] = Field(..., description="Recipe steps (text only, no transcript)")
    user_message: str = Field(..., description="User's question or message")
    current_step_index: Optional[int] = Field(None, description="Current step index (0-based)")


class ChatResponse(BaseModel):
    message: str = Field(..., description="AI assistant response")


SYSTEM_PROMPT = """You are a recipe extraction assistant. Your task is to extract structured recipe information from a video transcript.

CRITICAL RULES:
1. Output ONLY valid JSON. No markdown, no backticks, no explanations.
2. The JSON must match this exact schema:
{
  "title": "Recipe Title",
  "description": "Optional description",
  "ingredients": [
    {"qty": "0.5", "unit": "cup", "item": "dried cilantro"},
    {"qty": "As required", "unit": "", "item": "oil (for cooking)"},
    {"qty": "To taste", "unit": "", "item": "salt"}
  ],
  "steps": [
    {"index": 1, "text": "Step instruction", "timestamp_sec": 123},
    {"index": 2, "text": "Step instruction", "timestamp_sec": 456},
    ...
  ]
}

3. Ingredients must be an array of objects with qty, unit, and item fields:
   - qty: ALWAYS a string. MUST NOT be empty.
     * If measurable quantity exists: MUST be a decimal string (no fractions, no mixed numbers).
       Examples: "1/2 cup" -> qty "0.5", "2 1/2 cups" -> qty "2.5", "3/4 tsp" -> qty "0.75"
     * If quantity missing or non-measurable:
       - For salt/pepper/seasoning keywords -> qty "To taste"
       - For oil/water/for cooking/as needed -> qty "As required"
   - unit: string, use "" when not present (e.g., "cup", "tsp", "tbsp", "g", "kg", "")
   - item: ingredient name/description excluding qty/unit (e.g., "dried cilantro", "oil (for cooking)", "salt")

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

        # Validate ingredients structure
        validated_ingredients = []
        for i, ing in enumerate(ingredients_list):
            if not isinstance(ing, dict):
                raise ValueError(f"Ingredient {i+1} is not an object")
            if "qty" not in ing or "unit" not in ing or "item" not in ing:
                raise ValueError(f"Ingredient {i+1} missing required fields (qty, unit, item)")
            qty = str(ing["qty"])
            unit = str(ing["unit"])
            item = str(ing["item"])
            if not qty or qty.strip() == "":
                raise ValueError(f"Ingredient {i+1} qty must not be empty")
            if not isinstance(qty, str) or not isinstance(unit, str) or not isinstance(item, str):
                raise ValueError(f"Ingredient {i+1} qty, unit, and item must be strings")
            validated_ingredients.append(
                Ingredient(
                    qty=qty,
                    unit=unit,
                    item=item,
                )
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
            ingredients=validated_ingredients,
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


# CHAT_SYSTEM_PROMPT = """You are a cooking assistant helping users while they cook. Answer questions concisely and practically based ONLY on the recipe context provided. Keep responses brief (2-3 sentences max when possible). Do not invent recipe-specific details beyond what's provided. If asked about something not in the recipe context, say so briefly."""

CHAT_SYSTEM_PROMPT = """
You are a cooking assistant helping users while they cook.

Use the recipe context when it is relevant.
If the user asks a general cooking question that is not answered by the recipe context, give practical general cooking advice.

Do NOT invent recipe-specific details that are not provided (times, temperatures, quantities, ingredients the user didn't mention).
If details are missing, give options and clearly label them as general suggestions.

Keep responses concise and actionable (2–5 sentences, use bullets if helpful).
"""



@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verify_service_token)])
async def chat(request: ChatRequest):
    """
    Answer cooking questions about a recipe. Does NOT use full transcript.
    """
    try:
        # Build minimal recipe context
        ingredients_text = "\n".join([
            f"- {ing.qty} {ing.unit} {ing.item}".strip()
            for ing in request.ingredients
        ])
        
        steps_text = "\n".join([
            f"{step.index if step.index is not None else i+1}. {step.text}"
            for i, step in enumerate(request.steps)
        ])
        
        current_step_info = ""
        if request.current_step_index is not None and 0 <= request.current_step_index < len(request.steps):
            current_step = request.steps[request.current_step_index]
            step_num = current_step.index if current_step.index is not None else (request.current_step_index + 1)
            current_step_info = f"\n\nCurrent step: {step_num}. {current_step.text}"
        
        description_text = f"\n{request.description}" if request.description else ""
        
        context_prompt = f"""Recipe: {request.title}{description_text}

Ingredients:
{ingredients_text}

Steps:
{steps_text}{current_step_info}

User question: {request.user_message}

Answer concisely and practically. Base your answer ONLY on the recipe context above. If the question is about something not in this context, say so briefly."""

        full_prompt = f"{CHAT_SYSTEM_PROMPT}\n\n{context_prompt}"

        try:
            response = model.generate_content(
                full_prompt,
                generation_config={
                    "temperature": 0.7,
                    "max_output_tokens": 300,  # Limit response length for cost efficiency
                },
            )
            content = response.text.strip()
        except Exception as e:
            raise ValueError(f"Gemini API error: {str(e)}")

        return ChatResponse(message=content)

    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid request: {str(e)}",
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

