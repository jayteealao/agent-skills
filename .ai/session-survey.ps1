$cutoff = (Get-Date).AddDays(-30)
Get-ChildItem "C:\Users\jayte\.claude\projects" -Directory | ForEach-Object {
    $name = $_.Name
    $files = Get-ChildItem $_.FullName -Filter '*.jsonl' -ErrorAction SilentlyContinue
    if ($files) {
        $recent = $files | Where-Object { $_.LastWriteTime -gt $cutoff }
        if ($recent) {
            [PSCustomObject]@{
                Project   = $name
                Files     = $recent.Count
                TotalKB   = [int](($recent | Measure-Object Length -Sum).Sum / 1KB)
                LastWrite = ($recent | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
            }
        }
    }
} | Sort-Object LastWrite -Descending | Format-Table -AutoSize
