# MyCookbook Architecture Diagram

## System Architecture

```mermaid
graph TB
    %% External Users and Services
    User[👤 User Browser]
    Gemini[🤖 Gemini AI API<br/>External]
    YouTube[📺 YouTube<br/>External]

    %% Frontend Layer
    subgraph Frontend["🌐 Frontend (React/TypeScript)"]
        direction TB
        AuthScreen[AuthScreen<br/>Login/Signup]
        MyRecipes[MyRecipes<br/>Recipe List]
        Cookbooks[Cookbooks<br/>Collection Mgmt]
        Feed[Feed<br/>Social Feed]
        Search[SearchScreen<br/>Search]
        Profile[Profile<br/>User Profile]
        RecipeDetail[RecipeDetail<br/>Recipe View]
        CookMode[CookMode<br/>Cooking UI]
        Sidebar[Sidebar<br/>Navigation]
        Header[Header<br/>Top Bar]
        CreateModal[CreateModal<br/>Import Recipe]
        EditModal[EditRecipeModal<br/>Edit Recipe]
        CookbookModal[CookbookSelectModal<br/>Select Cookbook]
    end

    %% API Gateway
    Gateway[🔌 API Gateway<br/>Fastify :8080<br/>- JWT Verification<br/>- Request Routing<br/>- CORS Handling]

    %% Backend Services
    subgraph BackendServices["⚙️ Backend Services"]
        direction TB
        
        subgraph AuthService["🔐 Auth Service :8001"]
            AuthAPI[Auth API<br/>- POST /signup<br/>- POST /login<br/>- POST /refresh<br/>- POST /logout]
            AuthDB[(🗄️ Auth DB<br/>PostgreSQL :5433<br/>- users_auth<br/>- refresh_tokens)]
            AuthAPI --> AuthDB
        end

        subgraph UserService["👤 User Service :8002"]
            UserAPI[User API<br/>- GET /me<br/>- PATCH /me<br/>- POST /internal/users]
            UserDB[(🗄️ User DB<br/>PostgreSQL :5434<br/>- users_profile)]
            UserAPI --> UserDB
        end

        subgraph RecipeService["📝 Recipe Service :8003"]
            RecipeAPI[Recipe API<br/>- GET /recipes<br/>- GET /:id<br/>- POST /import/youtube<br/>- GET /import-jobs/:id<br/>Internal:<br/>- POST /internal/import-jobs/:id/status<br/>- POST /internal/import-jobs/:id/transcript<br/>- POST /internal/recipes/from-import-job<br/>- GET /internal/recipes/:id/transcript]
            RecipeDB[(🗄️ Recipe DB<br/>PostgreSQL :5435<br/>- recipes<br/>- recipe_import_jobs<br/>- recipe_raw_source)]
            RecipeAPI --> RecipeDB
        end

        subgraph AIService["🤖 AI Orchestrator :8004<br/>Python/FastAPI"]
            AIAPI[AI API<br/>- POST /extract<br/>Extracts recipe from transcript<br/>using Gemini AI]
        end

        subgraph WorkerService["⚡ Workers :8005"]
            Worker[Worker Process<br/>- Consumes Kafka messages<br/>- Fetches YouTube transcripts<br/>- Calls AI Orchestrator<br/>- Creates recipes]
        end
    end

    %% Message Queue
    subgraph MessageQueue["📬 Message Queue"]
        Kafka[Kafka :9092<br/>Topic: recipe.jobs]
        Zookeeper[Zookeeper :2181<br/>Kafka Coordinator]
        Kafka --> Zookeeper
    end

    %% Frontend to Gateway
    User --> Frontend
    Frontend --> Gateway

    %% Gateway to Services
    Gateway -->|/api/auth/*| AuthAPI
    Gateway -->|/api/users/*<br/>JWT Required| UserAPI
    Gateway -->|/api/recipes/*<br/>JWT Required| RecipeAPI

    %% Auth Service to User Service
    AuthAPI -->|Internal Call<br/>POST /internal/users<br/>Service Token| UserAPI

    %% Recipe Import Flow
    RecipeAPI -->|Produces Messages| Kafka
    Kafka -->|Consumes Messages| Worker
    Worker -->|HTTP Call<br/>POST /extract<br/>Service Token| AIAPI
    Worker -->|Internal Calls<br/>Service Token| RecipeAPI
    Worker -->|yt-dlp CLI| YouTube

    %% AI Orchestrator to Gemini
    AIAPI -->|API Call<br/>Gemini SDK| Gemini

    %% Styling
    classDef frontend fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef backend fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef database fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef queue fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef external fill:#ffebee,stroke:#b71c1c,stroke-width:2px
    classDef gateway fill:#fff9c4,stroke:#f57f17,stroke-width:3px

    class Frontend,AuthScreen,MyRecipes,Cookbooks,Feed,Search,Profile,RecipeDetail,CookMode,Sidebar,Header,CreateModal,EditModal,CookbookModal frontend
    class AuthService,UserService,RecipeService,AIService,WorkerService,AuthAPI,UserAPI,RecipeAPI,AIAPI,Worker backend
    class AuthDB,UserDB,RecipeDB database
    class Kafka,Zookeeper queue
    class User,Gemini,YouTube external
    class Gateway gateway
```

## Component Details

### Frontend Components
- **AuthScreen**: Login/Signup interface
- **MyRecipes**: Recipe list view with filtering and sorting
- **Cookbooks**: Collection management UI
- **Feed**: Social feed (mock data for now)
- **SearchScreen**: Search functionality
- **Profile**: User profile view
- **RecipeDetail**: Detailed recipe view
- **CookMode**: Step-by-step cooking interface with timers
- **Sidebar**: Navigation sidebar
- **Header**: Top navigation bar
- **CreateModal**: YouTube import interface
- **EditRecipeModal**: Recipe editing interface
- **CookbookSelectModal**: Cookbook selection dialog

### Backend Services

#### API Gateway (Port 8080)
- Routes all frontend requests
- JWT token verification for protected routes
- CORS configuration
- Request/response proxying

#### Auth Service (Port 8001)
- User authentication (signup, login, logout, refresh)
- JWT token generation and validation
- Password hashing with bcrypt
- Refresh token management
- Creates user profile in User Service after signup

#### User Service (Port 8002)
- User profile management (GET/PATCH /me)
- Internal endpoint for profile creation
- Service token authentication for internal calls

#### Recipe Service (Port 8003)
- Recipe CRUD operations
- YouTube import job creation
- Import job status tracking
- Transcript storage
- Recipe creation from import jobs
- Kafka producer for job queueing

#### AI Orchestrator (Port 8004)
- Recipe extraction from transcripts
- Gemini AI integration
- Structured recipe data generation (title, ingredients, steps with timestamps)

#### Workers (Port 8005)
- Kafka consumer for import jobs
- YouTube transcript fetching using yt-dlp
- Transcript parsing and storage
- AI Orchestrator integration
- Recipe creation in Recipe Service

### Databases

#### Auth DB (Port 5433)
- `users_auth`: Email, password hash, provider
- `refresh_tokens`: Refresh token management

#### User DB (Port 5434)
- `users_profile`: Username, display name, bio, avatar, preferences

#### Recipe DB (Port 5435)
- `recipes`: Recipe data (title, ingredients, steps, metadata)
- `recipe_import_jobs`: Import job tracking and status
- `recipe_raw_source`: Original transcripts and source data

### Infrastructure

#### Kafka (Port 9092)
- Message broker for async job processing
- Topic: `recipe.jobs`
- Handles YouTube import job queueing

#### Zookeeper (Port 2181)
- Kafka coordination service

## Data Flow Examples

### User Registration Flow
1. User submits signup form (Frontend)
2. Frontend → Gateway → Auth Service
3. Auth Service creates auth record in Auth DB
4. Auth Service generates JWT tokens
5. Auth Service → User Service (internal) to create profile
6. User Service creates profile in User DB
7. Response with access token → Gateway → Frontend

### Recipe Import Flow
1. User submits YouTube URL (Frontend → CreateModal)
2. Frontend → Gateway → Recipe Service
3. Recipe Service creates import job in Recipe DB (status: QUEUED)
4. Recipe Service publishes job message to Kafka
5. Worker consumes message from Kafka
6. Worker updates job status to RUNNING
7. Worker uses yt-dlp to fetch transcript from YouTube
8. Worker stores transcript in Recipe DB
9. Worker → AI Orchestrator with transcript
10. AI Orchestrator → Gemini API for extraction
11. AI Orchestrator returns structured recipe data
12. Worker creates recipe in Recipe DB
13. Worker updates job status to READY
14. Frontend polls job status and displays recipe when ready

### Recipe View Flow
1. User navigates to recipe detail (Frontend)
2. Frontend → Gateway (with JWT) → Recipe Service
3. Recipe Service queries Recipe DB
4. Returns recipe data → Gateway → Frontend
5. Frontend displays RecipeDetail component

## Authentication Flow

1. User logs in via AuthScreen
2. Frontend → Gateway → Auth Service
3. Auth Service validates credentials against Auth DB
4. Auth Service returns access token (15min TTL) and sets refresh token cookie (30 days)
5. Frontend stores access token in memory
6. For protected routes, Frontend includes JWT in Authorization header
7. Gateway verifies JWT before proxying to backend services
8. Gateway adds `x-user-id` header for backend services
9. On token expiry, Frontend calls refresh endpoint
10. Auth Service validates refresh token cookie and returns new access token

## Internal Service Communication

- **Service Tokens**: Internal services use `x-service-token` header for service-to-service auth
- **Gateway Tokens**: Gateway uses `x-gateway-token` header when calling backend services
- **User ID**: Gateway extracts user ID from JWT and forwards via `x-user-id` header

## Technology Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, React Router
- **Backend**: Node.js, Fastify, TypeScript, Python, FastAPI
- **Databases**: PostgreSQL 15
- **Message Queue**: Apache Kafka
- **AI**: Google Gemini API
- **External Tools**: yt-dlp (YouTube transcript extraction)

---

## Sequence Diagrams

### 1. User Signup Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Gateway
    participant AuthService
    participant AuthDB
    participant UserService
    participant UserDB

    User->>Frontend: Submit signup form<br/>(email, password)
    Frontend->>Gateway: POST /api/auth/signup<br/>{email, password}
    Gateway->>AuthService: POST /signup<br/>{email, password}
    
    AuthService->>AuthDB: Check if email exists
    AuthDB-->>AuthService: Email not found
    
    AuthService->>AuthService: Generate userId (UUID)<br/>Hash password (bcrypt)
    AuthService->>AuthDB: INSERT users_auth<br/>(id, email, password_hash)
    AuthDB-->>AuthService: User created
    
    AuthService->>AuthService: Generate access token (JWT)<br/>Generate refresh token (UUID)
    AuthService->>AuthService: Hash refresh token (SHA256)
    AuthService->>AuthDB: INSERT refresh_tokens<br/>(token_hash, expires_at)
    AuthDB-->>AuthService: Token stored
    
    AuthService->>UserService: POST /internal/users<br/>x-service-token<br/>{id, email}
    UserService->>UserDB: INSERT users_profile<br/>(id, display_name from email)
    UserDB-->>UserService: Profile created
    UserService-->>AuthService: Profile created (200)
    
    AuthService->>AuthService: Set refresh_token cookie<br/>(HttpOnly, 30 days)
    AuthService-->>Gateway: 200 OK<br/>{access_token, user_id}<br/>Set-Cookie: refresh_token
    Gateway-->>Frontend: 200 OK<br/>{access_token, user_id}<br/>Set-Cookie: refresh_token
    Frontend->>Frontend: Store access_token in memory
    Frontend->>User: Show logged in state<br/>Redirect to home
```

### 2. User Login Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Gateway
    participant AuthService
    participant AuthDB

    User->>Frontend: Submit login form<br/>(email, password)
    Frontend->>Gateway: POST /api/auth/login<br/>{email, password}
    Gateway->>AuthService: POST /login<br/>{email, password}
    
    AuthService->>AuthService: Normalize email (lowercase)
    AuthService->>AuthDB: SELECT users_auth<br/>WHERE email = ?
    AuthDB-->>AuthService: User record<br/>{id, password_hash}
    
    AuthService->>AuthService: bcrypt.compare(password, password_hash)
    alt Invalid password
        AuthService-->>Gateway: 401 Unauthorized<br/>{error: "Invalid credentials"}
        Gateway-->>Frontend: 401 Unauthorized
        Frontend-->>User: Show error message
    else Valid password
        AuthService->>AuthService: Generate access token (JWT, 15min)<br/>Generate refresh token (UUID)<br/>Hash refresh token
        AuthService->>AuthDB: INSERT refresh_tokens<br/>(token_hash, expires_at)
        AuthDB-->>AuthService: Token stored
        
        AuthService->>AuthService: Set refresh_token cookie<br/>(HttpOnly, 30 days)
        AuthService-->>Gateway: 200 OK<br/>{access_token, user_id}<br/>Set-Cookie: refresh_token
        Gateway-->>Frontend: 200 OK<br/>{access_token, user_id}<br/>Set-Cookie: refresh_token
        Frontend->>Frontend: Store access_token in memory
        Frontend->>User: Show logged in state<br/>Fetch user profile & recipes
    end
```

### 3. Token Refresh Flow

```mermaid
sequenceDiagram
    participant Frontend
    participant Gateway
    participant AuthService
    participant AuthDB

    Note over Frontend: Access token expired or missing
    
    Frontend->>Gateway: POST /api/auth/refresh<br/>Cookie: refresh_token
    Gateway->>AuthService: POST /refresh<br/>Cookie: refresh_token
    
    AuthService->>AuthService: Extract refresh_token from cookie<br/>Hash token (SHA256)
    AuthService->>AuthDB: SELECT refresh_tokens<br/>WHERE token_hash = ?<br/>AND expires_at > NOW()
    AuthDB-->>AuthService: Token record<br/>{user_id, expires_at}
    
    alt Invalid or expired token
        AuthService-->>Gateway: 401 Unauthorized<br/>{error: "Invalid refresh token"}
        Gateway-->>Frontend: 401 Unauthorized
        Frontend->>Frontend: Clear access token<br/>Redirect to login
    else Valid token
        AuthService->>AuthDB: DELETE refresh_tokens<br/>WHERE token_hash = ?
        AuthDB-->>AuthService: Token deleted
        
        AuthService->>AuthService: Generate new access token (JWT, 15min)<br/>Generate new refresh token (UUID)<br/>Hash new refresh token
        AuthService->>AuthDB: INSERT refresh_tokens<br/>(new token_hash, expires_at)
        AuthDB-->>AuthService: New token stored
        
        AuthService->>AuthService: Set new refresh_token cookie
        AuthService-->>Gateway: 200 OK<br/>{access_token}<br/>Set-Cookie: refresh_token (new)
        Gateway-->>Frontend: 200 OK<br/>{access_token}<br/>Set-Cookie: refresh_token (new)
        Frontend->>Frontend: Update access_token in memory
        Frontend->>Frontend: Retry original request with new token
    end
```

### 4. Get User Profile Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Gateway
    participant UserService
    participant UserDB

    User->>Frontend: Navigate to profile page
    Frontend->>Frontend: Get access_token from memory
    Frontend->>Gateway: GET /api/users/me<br/>Authorization: Bearer {access_token}
    
    Gateway->>Gateway: Verify JWT token<br/>Extract user_id from token
    alt Invalid token
        Gateway-->>Frontend: 401 Unauthorized
        Frontend->>Frontend: Attempt token refresh
    else Valid token
        Gateway->>UserService: GET /me<br/>x-gateway-token<br/>x-user-id: {user_id}
        
        UserService->>UserService: Verify gateway token
        UserService->>UserService: Extract user_id from header
        UserService->>UserDB: SELECT users_profile<br/>WHERE id = ?
        UserDB-->>UserService: User profile<br/>{id, display_name, bio, avatar_url, preferences}
        
        UserService-->>Gateway: 200 OK<br/>{user profile data}
        Gateway-->>Frontend: 200 OK<br/>{user profile data}
        Frontend->>Frontend: Update user state
        Frontend->>User: Display profile information
    end
```

### 5. Recipe Import Flow (YouTube URL → Recipe)

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Gateway
    participant RecipeService
    participant RecipeDB
    participant Kafka
    participant Worker
    participant YouTube
    participant AIOrchestrator
    participant Gemini

    User->>Frontend: Submit YouTube URL<br/>(CreateModal)
    Frontend->>Gateway: POST /api/recipes/import/youtube<br/>Authorization: Bearer {token}<br/>{url}
    
    Gateway->>Gateway: Verify JWT<br/>Extract user_id
    Gateway->>RecipeService: POST /import/youtube<br/>x-gateway-token<br/>x-user-id: {user_id}<br/>{url}
    
    RecipeService->>RecipeService: Verify gateway token<br/>Validate YouTube URL format
    RecipeService->>RecipeService: Generate job_id (UUID)
    RecipeService->>RecipeDB: BEGIN TRANSACTION
    RecipeService->>RecipeDB: INSERT recipe_import_jobs<br/>(id, owner_id, source_type='youtube',<br/>source_ref=url, status='QUEUED')
    RecipeDB-->>RecipeService: Job created
    
    RecipeService->>Kafka: Produce message<br/>Topic: recipe.jobs<br/>{job_id, owner_id, source_type, url}
    Kafka-->>RecipeService: Message queued
    RecipeService->>RecipeDB: COMMIT TRANSACTION
    RecipeDB-->>RecipeService: Transaction committed
    
    RecipeService-->>Gateway: 200 OK<br/>{job_id, status: 'QUEUED'}
    Gateway-->>Frontend: 200 OK<br/>{job_id, status: 'QUEUED'}
    Frontend->>Frontend: Start polling job status
    
    Note over Worker: Worker consumes message from Kafka
    
    Worker->>Kafka: Consume message<br/>Topic: recipe.jobs
    Kafka-->>Worker: {job_id, owner_id, url}
    
    Worker->>RecipeService: POST /internal/import-jobs/{job_id}/status<br/>x-service-token<br/>{status: 'RUNNING'}
    RecipeService->>RecipeDB: UPDATE recipe_import_jobs<br/>SET status='RUNNING'
    RecipeDB-->>RecipeService: Status updated
    RecipeService-->>Worker: 200 OK
    
    Worker->>Worker: Extract video ID from URL
    Worker->>YouTube: yt-dlp --write-auto-subs<br/>--sub-lang en --sub-format vtt
    YouTube-->>Worker: VTT transcript file
    
    Worker->>Worker: Parse VTT to segments<br/>{start, dur, text}
    Worker->>Worker: Format transcript with timestamps<br/>"[XX.XXs] text content"
    
    Worker->>RecipeService: POST /internal/import-jobs/{job_id}/transcript<br/>x-service-token<br/>{segments, transcript_text}
    RecipeService->>RecipeDB: UPDATE recipe_import_jobs<br/>SET transcript_segments = ?
    RecipeDB-->>RecipeService: Transcript stored
    RecipeService-->>Worker: 200 OK
    
    Worker->>AIOrchestrator: POST /extract<br/>x-service-token<br/>{source_type: 'youtube',<br/>source_ref: url,<br/>transcript: formatted_text}
    
    AIOrchestrator->>AIOrchestrator: Build prompt with transcript
    AIOrchestrator->>Gemini: Generate content<br/>(Gemini API call)
    Gemini-->>AIOrchestrator: Recipe JSON<br/>{title, description, ingredients[],<br/>steps[{index, text, timestamp_sec}]}
    
    AIOrchestrator->>AIOrchestrator: Parse and validate JSON<br/>Validate structure
    AIOrchestrator-->>Worker: 200 OK<br/>{title, description, ingredients, steps}
    
    Worker->>RecipeService: POST /internal/recipes/from-import-job<br/>x-service-token<br/>{job_id, owner_id, source_ref,<br/>title, description, ingredients, steps}
    
    RecipeService->>RecipeDB: BEGIN TRANSACTION
    RecipeService->>RecipeDB: SELECT recipe_import_jobs<br/>WHERE id = ? (check status)
    RecipeDB-->>RecipeService: Job (status: 'RUNNING')
    
    RecipeService->>RecipeService: Generate recipe_id (UUID)
    RecipeService->>RecipeDB: INSERT recipes<br/>(id, owner_id, title, ingredients, steps)
    RecipeDB-->>RecipeService: Recipe created
    
    RecipeService->>RecipeDB: SELECT transcript_segments<br/>FROM recipe_import_jobs
    RecipeDB-->>RecipeService: Transcript data
    RecipeService->>RecipeDB: INSERT recipe_raw_source<br/>(recipe_id, source_text, source_json)
    RecipeDB-->>RecipeService: Raw source stored
    
    RecipeService->>RecipeDB: UPDATE recipe_import_jobs<br/>SET status='READY', recipe_id=?
    RecipeDB-->>RecipeService: Job updated
    RecipeService->>RecipeDB: COMMIT TRANSACTION
    RecipeDB-->>RecipeService: Transaction committed
    
    RecipeService-->>Worker: 200 OK<br/>{recipe_id}
    
    Worker->>RecipeService: POST /internal/import-jobs/{job_id}/status<br/>x-service-token<br/>{status: 'READY', recipe_id}
    RecipeService->>RecipeDB: UPDATE recipe_import_jobs<br/>SET status='READY' (already done, but idempotent)
    RecipeDB-->>RecipeService: Updated
    RecipeService-->>Worker: 200 OK
    
    Note over Frontend: Polling continues...
    
    Frontend->>Gateway: GET /api/recipes/import-jobs/{job_id}<br/>Authorization: Bearer {token}
    Gateway->>RecipeService: GET /import-jobs/{job_id}<br/>x-gateway-token<br/>x-user-id
    RecipeService->>RecipeDB: SELECT recipe_import_jobs<br/>WHERE id = ? AND owner_id = ?
    RecipeDB-->>RecipeService: Job (status: 'READY', recipe_id)
    RecipeService-->>Gateway: 200 OK<br/>{status: 'READY', recipe_id}
    Gateway-->>Frontend: 200 OK<br/>{status: 'READY', recipe_id}
    Frontend->>Frontend: Stop polling<br/>Navigate to recipe detail page
```

### 6. Get Recipe Detail Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Gateway
    participant RecipeService
    participant RecipeDB

    User->>Frontend: Click on recipe card
    Frontend->>Frontend: Get access_token from memory
    Frontend->>Gateway: GET /api/recipes/{recipe_id}<br/>Authorization: Bearer {token}
    
    Gateway->>Gateway: Verify JWT<br/>Extract user_id
    Gateway->>RecipeService: GET /{recipe_id}<br/>x-gateway-token<br/>x-user-id: {user_id}
    
    RecipeService->>RecipeService: Verify gateway token<br/>Validate recipe_id (UUID format)
    RecipeService->>RecipeDB: SELECT recipes<br/>WHERE id = ?
    RecipeDB-->>RecipeService: Recipe data<br/>{id, owner_id, title, description,<br/>ingredients, steps, created_at}
    
    RecipeService->>RecipeService: Check if owner_id == user_id
    alt Not owner
        RecipeService-->>Gateway: 403 Forbidden<br/>{error: "Access denied"}
        Gateway-->>Frontend: 403 Forbidden
        Frontend-->>User: Show error message
    else Is owner
        RecipeService-->>Gateway: 200 OK<br/>{recipe data}
        Gateway-->>Frontend: 200 OK<br/>{recipe data}
        Frontend->>Frontend: Transform backend format to frontend format<br/>(ingredients, steps with timestamps)
        Frontend->>User: Display RecipeDetail component<br/>(title, ingredients, steps, video)
    end
```

### 7. List User Recipes Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Gateway
    participant RecipeService
    participant RecipeDB

    User->>Frontend: Navigate to "My Recipes"
    Frontend->>Frontend: Get access_token from memory
    Frontend->>Gateway: GET /api/recipes<br/>Authorization: Bearer {token}
    
    Gateway->>Gateway: Verify JWT<br/>Extract user_id
    Gateway->>RecipeService: GET /<br/>x-gateway-token<br/>x-user-id: {user_id}
    
    RecipeService->>RecipeService: Verify gateway token<br/>Extract user_id from header
    RecipeService->>RecipeDB: SELECT recipes<br/>WHERE owner_id = ?<br/>ORDER BY created_at DESC
    RecipeDB-->>RecipeService: Recipe list<br/>[{id, title, description, ingredients,<br/>steps, created_at, updated_at}, ...]
    
    RecipeService-->>Gateway: 200 OK<br/>[{recipe}, ...]
    Gateway-->>Frontend: 200 OK<br/>[{recipe}, ...]
    Frontend->>Frontend: Transform recipes to frontend format<br/>Parse ingredients, format steps
    Frontend->>Frontend: Update recipes state
    Frontend->>User: Display MyRecipes component<br/>(grid/list of recipe cards)
```

### 8. Authenticated Request with Token Refresh

```mermaid
sequenceDiagram
    participant Frontend
    participant Gateway
    participant BackendService

    Note over Frontend: Access token expired or missing
    
    Frontend->>Gateway: GET /api/recipes<br/>Authorization: Bearer {expired_token}
    
    Gateway->>Gateway: Verify JWT token
    alt Token invalid/expired
        Gateway-->>Frontend: 401 Unauthorized
    end
    
    Frontend->>Frontend: Token refresh handler triggered
    Frontend->>Gateway: POST /api/auth/refresh<br/>Cookie: refresh_token
    
    Note over Gateway,BackendService: Token refresh flow (see diagram 3)
    
    Gateway-->>Frontend: 200 OK<br/>{access_token}<br/>Set-Cookie: refresh_token (new)
    
    Frontend->>Frontend: Update access_token in memory
    Frontend->>Gateway: GET /api/recipes<br/>Authorization: Bearer {new_token}
    
    Gateway->>Gateway: Verify JWT (new token)
    Gateway->>BackendService: Forward request<br/>x-gateway-token<br/>x-user-id
    BackendService-->>Gateway: 200 OK<br/>{data}
    Gateway-->>Frontend: 200 OK<br/>{data}
    Frontend->>Frontend: Process response
```

