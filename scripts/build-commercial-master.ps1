param(
  [string]$HistoricalWorkbook = "C:\Users\felip\OneDrive\Desktop\Poliplast\PUR_Comercial_Mejorado.xlsx",
  [string]$ProspectWorkbook = "C:\Users\felip\OneDrive\Desktop\Poliplast\outputs\comercial_20260827\BASE_COMERCIAL_IA_GRUPO_POLIPLAST.xlsx",
  [string]$OutputFile = "C:\Users\felip\OneDrive\Desktop\Poliplast\poliplast-sales-copilot\lib\commercial-master-data.mjs"
)

$ErrorActionPreference = 'Stop'

function Text($sheet, [int]$row, [int]$column) {
  return ([string]$sheet.Cells.Item($row, $column).Text).Trim()
}

function Normalize-Company([string]$value) {
  if (-not $value) { return '' }
  $formD = $value.Trim().ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object Text.StringBuilder
  foreach ($char in $formD.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }
  $normalized = ($builder.ToString() -replace '[^a-z0-9]+',' ').Trim()
  $normalized = ($normalized -replace '\b(sociedad anonima|sociedad de responsabilidad limitada|sociedad por acciones simplificada|s a s|s r l|s a|sas|srl|sa)\b',' ')
  return ($normalized -replace '\s+',' ').Trim()
}

function Normalize-Family([string]$value) {
  switch -Regex ($value.Trim().ToUpperInvariant()) {
    '^POLIURETANOS?$' { return 'Poliuretano' }
    '^POLIUREA$' { return 'Poliurea' }
    '^PURMAC$' { return 'PURMAC' }
    '^PENOSIL$' { return 'Penosil' }
    '^CARROZADOS?$' { return 'Carrozados' }
    '^RESINPLAST$' { return 'Resinplast' }
    '^BALDES?$' { return 'Baldes' }
    '^PISOS?$' { return 'Pisos' }
    '^EPP$' { return 'EPP' }
    '^ALMOHADAS?$' { return 'Almohadas' }
    default { return 'Sin definir' }
  }
}

function Stable-Id([string]$company) {
  $normalized = Normalize-Company $company
  $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
  $sha = [Security.Cryptography.SHA256]::Create()
  $hash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').Substring(0,10).ToLowerInvariant()
  $slug = ($normalized -replace '\s+','-')
  if ($slug.Length -gt 44) { $slug = $slug.Substring(0,44).TrimEnd('-') }
  return "master-$slug-$hash"
}

$records = [ordered]@{}

function Add-Or-Merge([hashtable]$record) {
  $company = [string]$record.company
  if (-not $company.Trim()) { return }
  $key = Normalize-Company $company
  if (-not $key) { return }
  if (-not $records.Contains($key)) {
    $record.id = Stable-Id $company
    $records[$key] = $record
    return
  }
  $current = $records[$key]
  foreach ($name in $record.Keys) {
    $incoming = $record[$name]
    if ($null -ne $incoming -and [string]$incoming -ne '' -and [string]$incoming -ne 'Sin definir' -and [string]$incoming -ne 'A confirmar') {
      $current[$name] = $incoming
    }
  }
  $sources = @([string]$current.source, [string]$record.source) | Where-Object { $_ } | Select-Object -Unique
  $current.source = $sources -join ' + '
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $historical = $excel.Workbooks.Open($HistoricalWorkbook, $null, $true)
  try {
    $sheet = $historical.Worksheets.Item('Segmentación Comercial')
    for ($row = 2; $row -le $sheet.UsedRange.Rows.Count; $row++) {
      $company = Text $sheet $row 1
      if (-not $company) { continue }
      $priority = Text $sheet $row 7
      Add-Or-Merge ([ordered]@{
        company=$company; cuit=(Text $sheet $row 2); sourceType='Cliente histórico'; source='PUR · Segmentación Comercial';
        totalPurchases=(Text $sheet $row 4); lastPurchase=(Text $sheet $row 5); daysWithoutPurchase=(Text $sheet $row 6);
        priority=$priority; mainProduct=(Text $sheet $row 8); sku=(Text $sheet $row 9); family=(Normalize-Family (Text $sheet $row 10));
        confidence=(Text $sheet $row 11); clientType=(Text $sheet $row 12); stage=((Text $sheet $row 13) -replace '^Sin contactar$','Nuevo');
        nextAction=(Text $sheet $row 14); nextDate=(Text $sheet $row 15); contact=(Text $sheet $row 16); notes=(Text $sheet $row 17);
        temperature=($(if($priority -eq 'ALTA'){'Caliente'}elseif($priority -eq 'MEDIA'){'Tibio'}else{'Frío'}));
        fit='A confirmar'; urgency='A confirmar'; potential=($(if($priority -eq 'ALTA'){'Hipótesis alta'}else{'Hipótesis media'}));
      })
    }

    $sheet = $historical.Worksheets.Item('RELEVAMIENTO')
    for ($row = 2; $row -le $sheet.UsedRange.Rows.Count; $row++) {
      $company = Text $sheet $row 1
      if (-not $company) { continue }
      $priority = Text $sheet $row 17
      Add-Or-Merge ([ordered]@{
        company=$company; province=(Text $sheet $row 2); city=(Text $sheet $row 3); currentMachine=(Text $sheet $row 4);
        currentSupplier=(Text $sheet $row 5); phone=(Text $sheet $row 6); email=(Text $sheet $row 7); purchased=(Text $sheet $row 8);
        contact=(Text $sheet $row 9); notes=(Text $sheet $row 10); lastPurchase=(Text $sheet $row 11); clientType=(Text $sheet $row 12);
        industry=(Text $sheet $row 13); family=(Normalize-Family (Text $sheet $row 14)); productPotential=(Text $sheet $row 15);
        stage=((Text $sheet $row 16) -replace '^Sin contactar$','Nuevo'); priority=$priority; nextAction=(Text $sheet $row 18);
        nextDate=(Text $sheet $row 19); source=(Text $sheet $row 20); confidence=(Text $sheet $row 21); owner=(Text $sheet $row 22);
        sourceType='Relevamiento activo'; temperature=($(if($priority -match 'ALTA|Alta'){'Caliente'}elseif($priority -match 'MEDIA|Media'){'Tibio'}else{'Frío'}));
        fit='A confirmar'; urgency='A confirmar'; potential=($(if($priority -match 'ALTA|Alta'){'Hipótesis alta'}else{'Hipótesis media'}));
      })
    }
  } finally { $historical.Close($false) }

  $prospects = $excel.Workbooks.Open($ProspectWorkbook, $null, $true)
  try {
    $sheet = $prospects.Worksheets.Item('Empresas')
    for ($row = 2; $row -le $sheet.UsedRange.Rows.Count; $row++) {
      $company = Text $sheet $row 2
      if (-not $company) { continue }
      $prospectable = Text $sheet $row 9
      $priority = Text $sheet $row 11
      $contactPublic = Text $sheet $row 16
      $phone = if($contactPublic -match '(\+?[0-9][0-9\s\-\(\)]{7,})'){$Matches[1].Trim()}else{''}
      $email = if($contactPublic -match '([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})'){$Matches[1]}else{''}
      Add-Or-Merge ([ordered]@{
        company=$company; legalName=(Text $sheet $row 3); family=(Normalize-Family (Text $sheet $row 1)); clientType=(Text $sheet $row 4);
        secondaryRoles=(Text $sheet $row 5); industry=(Text $sheet $row 6); application=(Text $sheet $row 7); productPotential=(Text $sheet $row 8);
        prospectable=$prospectable; competition=(Text $sheet $row 10); priority=$priority; city=(Text $sheet $row 12); province=(Text $sheet $row 13);
        decisionMaker=(Text $sheet $row 14); website=(Text $sheet $row 15); publicContact=$contactPublic; phone=$phone; email=$email;
        confidence=(Text $sheet $row 17); evidence=(Text $sheet $row 18); source=(Text $sheet $row 19); notes=(Text $sheet $row 20);
        sourceType='Prospecto de inteligencia comercial'; stage=($(if($prospectable -match 'No|Excluir'){'Descartado'}else{'Nuevo'}));
        temperature=($(if($priority -match '^A$|Alta'){'Caliente'}elseif($priority -match '^B$|Media'){'Tibio'}else{'Frío'}));
        fit=($(if($prospectable -match '^Sí$|^Si$'){'A confirmar'}else{'Revisar'})); urgency='A confirmar';
        potential=($(if($priority -match '^A$|Alta'){'Hipótesis alta'}else{'Hipótesis media'}));
      })
    }
  } finally { $prospects.Close($false) }
} finally {
  $excel.Quit()
  [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

$stamp = '2026-09-01T00:00:00.000Z'
$output = foreach ($record in $records.Values) {
  $record.createdAt = $stamp
  $record.updatedAt = $stamp
  $record
}
$json = $output | ConvertTo-Json -Depth 8 -Compress
$module = "// Generado desde las fuentes comerciales auditadas. No editar a mano.`nexport const COMMERCIAL_MASTER_CLIENTS = $json;`n"
[IO.File]::WriteAllText($OutputFile, $module, [Text.UTF8Encoding]::new($false))
Write-Output ("Generated {0} deduplicated clients at {1}" -f $output.Count, $OutputFile)
