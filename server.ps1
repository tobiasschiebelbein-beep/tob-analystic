# Servidor Web Nativo PowerShell para FitPulse Gym Manager
$port = 3000
$listener = New-Object System.Net.HttpListener

try {
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
    Write-Host "--------------------------------------------------------" -ForegroundColor Green
    Write-Host " Servidor Espacio Despertar ejecutandose en http://localhost:$port" -ForegroundColor Cyan
    Write-Host "--------------------------------------------------------" -ForegroundColor Green
    Start-Process "http://localhost:$port/"
} catch {
    $port = 8080
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
    Write-Host "--------------------------------------------------------" -ForegroundColor Green
    Write-Host " Servidor Espacio Despertar ejecutandose en http://localhost:$port" -ForegroundColor Cyan
    Write-Host "--------------------------------------------------------" -ForegroundColor Green
    Start-Process "http://localhost:$port/"
}

$root = $PSScriptRoot

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "" -or $urlPath -eq "/") { $urlPath = "/index.html" }
        
        $filePath = Join-Path $root $urlPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            if ($filePath.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
            elseif ($filePath.EndsWith(".css")) { $response.ContentType = "text/css" }
            elseif ($filePath.EndsWith(".js")) { $response.ContentType = "application/javascript" }
            elseif ($filePath.EndsWith(".json")) { $response.ContentType = "application/json" }
            else { $response.ContentType = "application/octet-stream" }
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.Close()
    } catch {
        # Continue listening on socket errors
    }
}
