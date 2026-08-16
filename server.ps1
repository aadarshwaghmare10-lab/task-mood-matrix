# Minimal static web server & AI API Proxy in PowerShell using HttpListener
param([int]$Port = 8080)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
    Write-Host "Server running at http://localhost:$Port/"
} catch {
    Write-Host "Failed to start listener: $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

function Validate-AiActionData ($action) {
    if (-not $action -or -not $action.type) { return $null }

    $validTypes = @("CREATE_TASK", "UPDATE_TASK", "TOGGLE_TASK", "MOVE_TASK", "DELETE_TASK")
    if ($validTypes -notcontains $action.type) { return $null }

    $data = $action.data
    if (-not $data) { $data = @{} }

    # Validate & sanitize quadrant key
    if ($data.quadrant) {
        $quadLower = [string]$data.quadrant.ToLower().Trim()
        if ($quadLower -notmatch '^(q1|q2|q3|q4)$') {
            $data.quadrant = "q2"
        } else {
            $data.quadrant = $quadLower
        }
    } else {
        $data.quadrant = "q2"
    }

    # Sanitize title
    if ($data.title) {
        $data.title = [string]$data.title.Trim()
    } else {
        $data.title = "Untitled Task"
    }

    return @{
        type = $action.type
        data = $data
    }
}

function Extract-TaskTitleAndQuadrant ($userMsg) {
    $lower = $userMsg.ToLower()

    # 1. Determine quadrant
    $targetQuad = "q2"
    if ($lower -match '\b(q1|do first|urgent and important)\b') { $targetQuad = "q1" }
    elseif ($lower -match '\b(q2|schedule|important)\b') { $targetQuad = "q2" }
    elseif ($lower -match '\b(q3|delegate|urgent)\b') { $targetQuad = "q3" }
    elseif ($lower -match '\b(q4|eliminate)\b') { $targetQuad = "q4" }

    # 2. Clean task title
    $title = $userMsg

    # Strip conversational prefixes
    $title = $title -replace '(?i)^.*?\b(called|named)\s+["'']?', ''
    $title = $title -replace '(?i)^.*?\b(create|add|new)\s+(a\s+)?(task\s+)?(to|for)?\s*["'']?', ''
    $title = $title -replace '(?i)^task\s+', ''

    # Strip trailing quadrant clauses
    $title = $title -replace '(?i)["'']?\s+(and\s+)?(put\s+it\s+)?(in|to)\s+(q[1-4]|quadrant\s+[1-4]).*$', ''
    $title = $title -replace '(?i)["'']?\s+(in|to)\s+(q[1-4]|quadrant\s+[1-4]).*$', ''
    $title = $title.Trim().Trim('"').Trim("'").Trim()

    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = "New Task"
    }

    return @{
        title = $title
        quadrant = $targetQuad
    }
}

function Extract-CompleteTaskIntent ($userMsg, $tasksList) {
    if (-not $tasksList -or $tasksList.Count -eq 0) {
        return $null
    }

    $lower = $userMsg.ToLower()

    # Creation request guard: if user message is a task creation request, do NOT run completion matching!
    if ($lower -match '^\s*(create|add|new)\b' -or $lower -match '\b(create|add)\s+(a\s+)?(new\s+)?task\b') {
        return $null
    }

    # Check if user message contains completion keywords
    $isCompleteIntent = ($lower -match '\b(mark|complete|completed|finish|finished|done)\b')
    if (-not $isCompleteIntent) {
        return $null
    }

    # 1. Substring match against live task titles in context
    foreach ($task in $tasksList) {
        if ($task.title -and $task.title.Trim().Length -gt 0) {
            $taskTitleLower = $task.title.ToLower().Trim()
            if ($lower.Contains($taskTitleLower)) {
                return $task
            }
        }
    }

    # 2. Strip completion verbs to isolate task query
    $query = $userMsg -replace '(?i)^\s*(mark|complete|i finished|finish|finished)\s+', ''
    $query = $query -replace '(?i)\s+(as completed|as complete|complete|completed|done)\.?\s*$', ''
    $query = $query.Trim().Trim('.').Trim('"').Trim("'").Trim()

    if ($query.Length -gt 0) {
        foreach ($task in $tasksList) {
            if ($task.title -and ($task.title.ToLower().Contains($query.ToLower()) -or $query.ToLower().Contains($task.title.ToLower()))) {
                return $task
            }
        }
    }

    # Return null if no matching task title found
    return $null
}

function Process-AiChat {
    param($requestObj)

    $userMsg = ""
    if ($requestObj -and $requestObj.message) {
        $userMsg = [string]$requestObj.message
    }

    $context = $null
    if ($requestObj -and $requestObj.context) {
        $context = $requestObj.context
    }

    $history = @()
    if ($requestObj -and $requestObj.history) {
        $history = @($requestObj.history)
    }

    $apiKey = $env:GEMINI_API_KEY

    if ($apiKey -and $apiKey.Trim().Length -gt 0) {
        try {
            $contextJson = $context | ConvertTo-Json -Depth 5 -Compress
            $systemInstruction = @"
You are NOVA, an intelligent AI productivity assistant integrated into the Task & Mood Matrix application.
You help users organize, prioritize, and manage their tasks across 4 Eisenhower Quadrants:
- q1: Do First (Urgent & Important)
- q2: Schedule (Important, Not Urgent)
- q3: Delegate (Urgent, Not Important)
- q4: Eliminate (Not Urgent or Important)

CURRENT USER CONTEXT:
Active Mood State: $($context.mood)
Live Matrix Tasks: $contextJson

MOOD & MATRIX BALANCING HEURISTICS:
- Q1 Overload (>3 tasks): Prioritize suggesting suitable non-urgent tasks for Q2 Schedule.
- Q3 Overload (>2 tasks): Suggest reviewing and delegating suitable tasks.
- Q4 Moves: ONLY propose moving to Q4 when the task is clearly non-urgent and non-important or the user explicitly asks to eliminate/deprioritize it.

TASK ACTION FORMATTING RULES:
For creation requests starting with 'Create', 'Add', or 'New Task', ALWAYS generate type 'CREATE_TASK'.
For completion requests like 'Mark X as completed' or 'Complete X', match X against the existing tasks list and return type 'TOGGLE_TASK' with data.id set to the matching task ID.
When extracting task titles for CREATE_TASK, return CLEAN titles without prefixes like 'called' or trailing phrases like 'and put in Q2'.
For task update requests, return 'UPDATE_TASK' with data containing id, title, description, quadrant, oldTitle, oldQuadrant, oldDescription.

CRITICAL RESPONSE SCHEMA:
You MUST respond ONLY with a single raw valid JSON object:
{
  "reply": "Conversational response explaining recommendations or proposed actions...",
  "proposedActions": [
    {
      "type": "CREATE_TASK" | "UPDATE_TASK" | "TOGGLE_TASK" | "MOVE_TASK" | "DELETE_TASK",
      "data": {
        "id": "task-id (required for UPDATE, TOGGLE, MOVE, DELETE)",
        "title": "clean task title",
        "description": "optional notes",
        "quadrant": "q1" | "q2" | "q3" | "q4",
        "mood": "focused" | "productive" | "calm" | "energized" | "stressed"
      }
    }
  ]
}
"@

            $contentsList = [System.Collections.ArrayList]::new()
            foreach ($item in $history) {
                $roleStr = if ($item.role -eq 'user') { "user" } else { "model" }
                [void]$contentsList.Add(@{
                    role = $roleStr
                    parts = @( @{ text = [string]$item.content } )
                })
            }

            # Append current prompt with system instructions
            [void]$contentsList.Add(@{
                role = "user"
                parts = @( @{ text = "$systemInstruction`n`nUser Message: $userMsg" } )
            })

            $payload = @{
                contents = $contentsList
                generationConfig = @{
                    temperature = 0.2
                    responseMimeType = "application/json"
                }
            } | ConvertTo-Json -Depth 10

            $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey"
            $apiResponse = Invoke-RestMethod -Uri $apiUrl -Method Post -ContentType "application/json" -Body $payload
            $rawText = $apiResponse.candidates[0].content.parts[0].text

            $parsedResult = $rawText | ConvertFrom-Json

            # Validate proposed actions
            $validatedActions = @()
            if ($parsedResult.proposedActions) {
                foreach ($act in $parsedResult.proposedActions) {
                    $val = Validate-AiActionData -action $act
                    if ($val) { $validatedActions += $val }
                }
            }

            return @{
                reply = $parsedResult.reply
                proposedActions = $validatedActions
            }
        } catch {
            Write-Host "Gemini API call error: $_"
        }
    }

    # Fallback Rule-Based Engine (runs safely if no API key is set or API fails)
    $lowerMsg = $userMsg.ToLower()
    $actionsList = [System.Collections.ArrayList]::new()
    $replyText = ""

    $userMood = "focused"
    if ($context -and $context.mood) {
        $userMood = $context.mood
    }

    $tasksList = @()
    if ($context -and $context.tasks) {
        $tasksList = @($context.tasks)
    }

    # 1. Productivity Audit Engine
    if ($lowerMsg -like "*audit*" -or $lowerMsg -like "*velocity*" -or $lowerMsg -like "*deep work*") {
        $totalCount = $tasksList.Count
        $completedCount = 0
        foreach ($t in $tasksList) {
            if ($t.completed -eq $true) { $completedCount++ }
        }
        $activeCount = $totalCount - $completedCount
        $compRate = if ($totalCount -gt 0) { [math]::Round(($completedCount / $totalCount) * 100, 1) } else { 0 }

        $q1 = 0; $q2 = 0; $q3 = 0; $q4 = 0
        foreach ($t in $tasksList) {
            if (-not $t.completed) {
                if ($t.quadrant -eq 'q1') { $q1++ }
                elseif ($t.quadrant -eq 'q2') { $q2++ }
                elseif ($t.quadrant -eq 'q3') { $q3++ }
                elseif ($t.quadrant -eq 'q4') { $q4++ }
            }
        }

        $deepWorkRatio = if ($activeCount -gt 0) { [math]::Round(($q2 / $activeCount) * 100, 1) } else { 0 }
        $overloadStatus = if ($q1 -gt 3) { "HIGH (Urgent Overload Alert!)" } else { "NORMAL" }

        $replyText = "PRODUCTIVITY AUDIT REPORT:`n" +
                     "- Overload Index: $overloadStatus (Q1: $q1 active tasks)`n" +
                     "- Deep Work Ratio: $deepWorkRatio% of active tasks in Q2 Schedule`n" +
                     "- Completion Rate: $compRate% ($completedCount of $totalCount completed)`n" +
                     "- Active Workload: $activeCount tasks pending`n`n" +
                     "Recommendation: Keep Q1 low by proactively scheduling important tasks in Q2."
    }
    # 2. Matrix Auto-Balancing Intent
    elseif ($lowerMsg -like "*balance*" -or $lowerMsg -like "*rebalance*" -or $lowerMsg -like "*organize q1*" -or $lowerMsg -like "*organize q3*") {
        $q1Active = @($tasksList | Where-Object { $_.quadrant -eq 'q1' -and -not $_.completed })
        $q3Active = @($tasksList | Where-Object { $_.quadrant -eq 'q3' -and -not $_.completed })

        if ($q1Active.Count -gt 3) {
            # Q1 Overload (>3 active tasks): move 4th+ Q1 task to Q2 (Schedule) as per rules
            $targetTask = $q1Active[3]
            [void]$actionsList.Add(@{
                type = "MOVE_TASK"
                data = @{
                    id = $targetTask.id
                    title = $targetTask.title
                    quadrant = "q2"
                    oldQuadrant = "q1"
                }
            })
            $replyText = "I've detected a Q1 overload ($($q1Active.Count) active tasks, exceeding the 3-task threshold). I've prepared a proposed action to balance your matrix by moving '$($targetTask.title)' to Q2 Schedule."
        }
        elseif ($q1Active.Count -gt 1) {
            $targetTask = $q1Active[1]
            [void]$actionsList.Add(@{
                type = "MOVE_TASK"
                data = @{
                    id = $targetTask.id
                    title = $targetTask.title
                    quadrant = "q2"
                    oldQuadrant = "q1"
                }
            })
            $replyText = "I've analyzed your Q1 workload ($($q1Active.Count) active tasks) and prepared a proposed action to balance your matrix by moving '$($targetTask.title)' to Q2 Schedule."
        }
        elseif ($q3Active.Count -gt 1) {
            $targetTask = $q3Active[0]
            $replyText = "Your Q3 Delegate quadrant has $($q3Active.Count) items. I recommend reviewing '$($targetTask.title)' for delegation."
        }
        else {
            $replyText = "Your matrix workload is currently well balanced! Q1 Do First has $($q1Active.Count) active task(s)."
        }
    }
    # 3. Task Decomposition Intent
    elseif ($lowerMsg -like "*break down*" -or $lowerMsg -like "*decompose*" -or $lowerMsg -like "*subtask*" -or $lowerMsg -like "*split *") {
        $targetTask = $null
        foreach ($t in $tasksList) {
            if (-not $t.completed -and $lowerMsg.Contains($t.title.ToLower())) {
                $targetTask = $t
                break
            }
        }
        if (-not $targetTask -and $tasksList.Count -gt 0) {
            $targetTask = $tasksList[0]
        }

        if ($targetTask) {
            [void]$actionsList.Add(@{
                type = "CREATE_TASK"
                data = @{
                    title = "Phase 1: Research & Outline for $($targetTask.title)"
                    quadrant = "q2"
                    description = "Subtask created via NOVA decomposition of '$($targetTask.title)'"
                    mood = $userMood
                }
            })
            [void]$actionsList.Add(@{
                type = "CREATE_TASK"
                data = @{
                    title = "Phase 2: Executive Draft for $($targetTask.title)"
                    quadrant = "q1"
                    description = "Subtask created via NOVA decomposition of '$($targetTask.title)'"
                    mood = $userMood
                }
            })
            $replyText = "I've decomposed '$($targetTask.title)' into 2 actionable sub-tasks. Please review and confirm below."
        } else {
            $replyText = "No task found to break down."
        }
    }
    # 4. Natural Language Task Update Intent
    elseif ($lowerMsg -like "*update *" -or $lowerMsg -like "*rename *" -or $lowerMsg -like "*change title*") {
        $targetTask = $null
        foreach ($t in $tasksList) {
            if ($lowerMsg.Contains($t.title.ToLower())) {
                $targetTask = $t
                break
            }
        }
        if (-not $targetTask -and $tasksList.Count -gt 0) {
            $targetTask = $tasksList[0]
        }

        if ($targetTask) {
            $newTitle = $userMsg -replace '(?i)^.*?\b(to|as|title)\s+["'']?', ''
            $newTitle = $newTitle.Trim().Trim('"').Trim("'").Trim()
            if ([string]::IsNullOrWhiteSpace($newTitle)) { $newTitle = "$($targetTask.title) (Updated)" }

            [void]$actionsList.Add(@{
                type = "UPDATE_TASK"
                data = @{
                    id = $targetTask.id
                    title = $newTitle
                    oldTitle = $targetTask.title
                    quadrant = $targetTask.quadrant
                    oldQuadrant = $targetTask.quadrant
                }
            })
            $replyText = "I've prepared a proposed update action for '$($targetTask.title)'. Please review the diff below and confirm."
        } else {
            $replyText = "No task found to update."
        }
    }
    # 5. Task Creation Intent
    elseif ($lowerMsg -like "*add *" -or $lowerMsg -like "*create *" -or $lowerMsg -like "*new task*") {
        $extracted = Extract-TaskTitleAndQuadrant -userMsg $userMsg
        $taskTitle = $extracted.title
        $targetQuad = $extracted.quadrant

        [void]$actionsList.Add(@{
            type = "CREATE_TASK"
            data = @{
                title = $taskTitle
                description = "Created via NOVA Assistant"
                quadrant = $targetQuad
                mood = $userMood
            }
        })
        $replyText = "I've prepared a proposed action to create '$taskTitle' in $($targetQuad.ToUpper()). Please review and confirm below."
    }
    # 6. Task Completion Intent
    elseif ($completedTask = Extract-CompleteTaskIntent -userMsg $userMsg -tasksList $tasksList) {
        [void]$actionsList.Add(@{
            type = "TOGGLE_TASK"
            data = @{
                id = $completedTask.id
                title = $completedTask.title
            }
        })
        $replyText = "I've prepared an action to mark '$($completedTask.title)' as completed. Please review and confirm below."
    }
    # 7. Task Deletion Intent
    elseif ($lowerMsg -like "*delete *" -or $lowerMsg -like "*remove *") {
        $targetTask = $null
        if ($tasksList.Count -gt 0) {
            $targetTask = $tasksList[0]
        }

        if ($targetTask) {
            [void]$actionsList.Add(@{
                type = "DELETE_TASK"
                data = @{
                    id = $targetTask.id
                    title = $targetTask.title
                    quadrant = $targetTask.quadrant
                }
            })
            $replyText = "I've prepared a proposed action to delete '$($targetTask.title)'. Please review and confirm below."
        } else {
            $replyText = "I couldn't find a task matching that name in your matrix."
        }
    }
    # 8. Task Movement Intent
    elseif ($lowerMsg -like "*move *" -or $lowerMsg -like "*shift *") {
        $targetQuad = "q2"
        if ($lowerMsg -like "*q1*") { $targetQuad = "q1" }
        elseif ($lowerMsg -like "*q3*") { $targetQuad = "q3" }
        elseif ($lowerMsg -like "*q4*") { $targetQuad = "q4" }

        $targetTask = $null
        if ($tasksList.Count -gt 0) {
            $targetTask = $tasksList[0]
        }

        if ($targetTask) {
            [void]$actionsList.Add(@{
                type = "MOVE_TASK"
                data = @{
                    id = $targetTask.id
                    title = $targetTask.title
                    quadrant = $targetQuad
                }
            })
            $replyText = "I've prepared a proposed action to move '$($targetTask.title)' to $($targetQuad.ToUpper()). Please review and confirm below."
        } else {
            $replyText = "You currently have no tasks to move."
        }
    }
    # 9. Mood-Aware Focus / Recommendation Intent
    elseif ($lowerMsg -like "*focus*" -or $lowerMsg -like "*recommend*" -or $lowerMsg -like "*what should*") {
        $q1Count = 0; $q2Count = 0; $q3Count = 0; $q4Count = 0
        foreach ($t in $tasksList) {
            if (-not $t.completed) {
                if ($t.quadrant -eq 'q1') { $q1Count++ }
                elseif ($t.quadrant -eq 'q2') { $q2Count++ }
                elseif ($t.quadrant -eq 'q3') { $q3Count++ }
                elseif ($t.quadrant -eq 'q4') { $q4Count++ }
            }
        }

        switch ($userMood) {
            "stressed" {
                $replyText = "In your Stressed state, let's keep cognitive overload low. You have $q1Count urgent items in Q1 and $q3Count in Q3. I recommend delegating Q3 items and taking on one Q1 task at a time."
            }
            "focused" {
                $replyText = "In your Deep Focus state, this is the prime time to tackle Q1 ($q1Count tasks) and drive high-impact Q2 Schedule tasks ($q2Count tasks)!"
            }
            "energized" {
                $replyText = "In your Energized state, you have great momentum! Tackle your $q1Count Q1 Do First items or clear out quick sprints."
            }
            default {
                $replyText = "Based on your $userMood workspace (Q1: $q1Count, Q2: $q2Count, Q3: $q3Count, Q4: $q4Count), focus on high-importance Q1 and Q2 items first."
            }
        }
    }
    else {
        $count = $tasksList.Count
        $replyText = "I'm analyzing your $userMood workspace. You currently have $count task(s). Ask me to create, move, complete, update, decompose, or balance your tasks!"
    }

    return @{
        reply = $replyText
        proposedActions = @($actionsList)
    }
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        continue
    }

    $path = $request.Url.LocalPath

    if ($path -eq "/api/chat" -and $request.HttpMethod -eq "POST") {
        try {
            $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
            $jsonBody = $reader.ReadToEnd()
            $reader.Close()

            $requestObj = $jsonBody | ConvertFrom-Json
            $aiResult = Process-AiChat -requestObj $requestObj

            $jsonResponse = $aiResult | ConvertTo-Json -Depth 10
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonResponse)

            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
        } catch {
            Write-Host "Error processing /api/chat: $_"
            $errResponse = @{ reply = "An error occurred while processing your request."; proposedActions = @() } | ConvertTo-Json
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($errResponse)
            $response.StatusCode = 500
            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
        }
        continue
    }

    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path (Get-Location) $path.TrimStart('/')

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        $response.ContentType = $contentType
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
    } else {
        $response.StatusCode = 404
        $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
        $response.Close()
    }
}
