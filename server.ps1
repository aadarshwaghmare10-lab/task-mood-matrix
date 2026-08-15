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

    # 3. Fallback to first available task
    return $tasksList[0]
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

    $apiKey = $env:GEMINI_API_KEY

    if ($apiKey -and $apiKey.Trim().Length -gt 0) {
        try {
            $contextJson = $context | ConvertTo-Json -Depth 5 -Compress
            $systemInstruction = "You are NOVA, an intelligent AI productivity assistant integrated into the Task & Mood Matrix. Help users manage tasks across 4 Eisenhower Quadrants (q1: Do First, q2: Schedule, q3: Delegate, q4: Eliminate). Current Mood: $($context.mood). Tasks: $contextJson. For completion requests like 'Mark X as completed' or 'Complete X', match X against the existing tasks list and return type 'TOGGLE_TASK' with data.id set to the matching task ID. You MUST respond ONLY with a single raw valid JSON object: { `"reply`": `"Conversational explanation...`", `"proposedActions`": [ { `"type`": `"CREATE_TASK`" | `"UPDATE_TASK`" | `"TOGGLE_TASK`" | `"MOVE_TASK`" | `"DELETE_TASK`", `"data`": { `"id`": `"task-id`", `"title`": `"title`", `"description`": `"notes`", `"quadrant`": `"q1`"|`"q2`"|`"q3`"|`"q4`", `"mood`": `"focused`" } } ] }."

            $payload = @{
                contents = @(
                    @{
                        role = "user"
                        parts = @(
                            @{ text = "$systemInstruction`n`nUser Message: $userMsg" }
                        )
                    }
                )
                generationConfig = @{
                    temperature = 0.2
                    responseMimeType = "application/json"
                }
            } | ConvertTo-Json -Depth 10

            $apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey"
            $apiResponse = Invoke-RestMethod -Uri $apiUrl -Method Post -ContentType "application/json" -Body $payload
            $rawText = $apiResponse.candidates[0].content.parts[0].text

            return ($rawText | ConvertFrom-Json)
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

    # 1. Task Completion Intent Detection
    $completedTask = Extract-CompleteTaskIntent -userMsg $userMsg -tasksList $tasksList
    if ($completedTask) {
        [void]$actionsList.Add(@{
            type = "TOGGLE_TASK"
            data = @{
                id = $completedTask.id
                title = $completedTask.title
            }
        })
        $replyText = "I've prepared an action to mark '$($completedTask.title)' as completed. Please review and confirm below."
    }
    # 2. Task Creation Intent Detection
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
    # 3. Task Deletion Intent Detection
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
    # 4. Task Movement Intent Detection
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
    else {
        $count = $tasksList.Count
        $replyText = "I'm analyzing your $userMood workspace. You currently have $count task(s). Ask me to create, move, complete, or delete any tasks!"
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
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
    } else {
        $response.StatusCode = 404
        $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
        $response.Close()
    }
}
