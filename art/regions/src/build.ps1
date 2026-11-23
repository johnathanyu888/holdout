# Builds the zoomed-in region scenes: art/regions/src/*.svg -> art/regions/*.svg
#  <!--KIT2-->        shared asset kit (art/kit/kit2.svgfrag) + scene styles/filters
#  <flash ref="id" begin="0.4"/>   white flashing hint on a tappable object (the object is <g id="id">)
#  <card .../>        the details card of the object the player just tapped
#  <hud .../>         region pill, daylight bar, "return home" button
param([switch]$WithUI)
$src  = $PSScriptRoot
$root = Split-Path $src -Parent
$art  = Split-Path $root -Parent
$utf8 = New-Object Text.UTF8Encoding $false
$kit  = [IO.File]::ReadAllText((Join-Path $art 'kit\kit2.svgfrag')).TrimEnd()
$icon = @{ wood='materials/wood'; stone='materials/stone'; scrap='materials/scrap'; rope='materials/rope'; wire='materials/wire'; gears='materials/gears'; cloth='materials/cloth'; glass='materials/glass'; bandage='consumables/bandage'; repair='consumables/repair_kit'; firecracker='consumables/firecracker' }
$dcol = @{ safe='#4FA83A'; risky='#E08A2A'; danger='#D9534F' }
$dtxt = @{ safe='SAFE'; risky='RISKY'; danger='DANGER' }

function Get-Attr([string]$tagText,[string]$name){ $m=[regex]::Match($tagText, "\b$name=`"([^`"]*)`""); if($m.Success){$m.Groups[1].Value}else{''} }

function Expand-Flash([string]$t){
  $ref=Get-Attr $t 'ref'; $b=Get-Attr $t 'begin'; if(-not $b){$b='0'}
  "<use href=`"#$ref`" filter=`"url(#flash)`" pointer-events=`"none`"><animate attributeName=`"opacity`" values=`"0.15;1;0.15`" keyTimes=`"0;0.5;1`" dur=`"1.6s`" begin=`"$($b)s`" repeatCount=`"indefinite`"/></use>"
}

function Expand-Card([string]$t){
  $x=[double](Get-Attr $t 'x'); $y=[double](Get-Attr $t 'y'); $ax=[double](Get-Attr $t 'ax'); $ay=[double](Get-Attr $t 'ay')
  $name=Get-Attr $t 'name'; $desc=Get-Attr $t 'desc'; $time=Get-Attr $t 'time'; $d=Get-Attr $t 'danger'
  $loot=@((Get-Attr $t 'loot') -split ',' | Where-Object { $_ })
  $w=280; $h=150; $cx=$x+$w/2; $cy=$y+$h/2
  $o  = "<g class=`"card`"><path d=`"M$ax $ay L$cx $cy`" stroke=`"#25282C`" stroke-width=`"6`"/><path d=`"M$ax $ay L$cx $cy`" stroke=`"#FFFFFF`" stroke-width=`"3`"/><circle cx=`"$ax`" cy=`"$ay`" r=`"7`" fill=`"#FFFFFF`" stroke=`"#25282C`" stroke-width=`"2.5`"/>"
  $o += "<g transform=`"translate($x $y)`"><rect x=`"4`" y=`"6`" width=`"$w`" height=`"$h`" rx=`"12`" fill=`"#000`" opacity=`".3`"/><rect width=`"$w`" height=`"$h`" rx=`"12`" fill=`"#1E2328`" fill-opacity=`".96`" stroke=`"#C9A24A`" stroke-width=`"2.5`"/>"
  $o += "<text x=`"14`" y=`"26`" class=`"cn`">$name</text>"
  $o += "<rect x=`"$($w-76)`" y=`"11`" width=`"64`" height=`"20`" rx=`"10`" fill=`"$($dcol[$d])`" stroke=`"#25282C`" stroke-width=`"1.5`"/><text x=`"$($w-44)`" y=`"25.5`" class=`"td`">$($dtxt[$d])</text>"
  $o += "<text x=`"14`" y=`"46`" class=`"cd`">$desc</text>"
  $o += "<g transform=`"translate(14 56)`"><circle cx=`"9`" cy=`"10`" r=`"8`" fill=`"none`" stroke=`"#FFD34D`" stroke-width=`"2.2`"/><path d=`"M9 5 V10 H13`" stroke=`"#FFD34D`" stroke-width=`"2.2`" fill=`"none`" stroke-linecap=`"round`"/></g><text x=`"36`" y=`"71`" class=`"ts`">Search time: $time</text>"
  $o += "<text x=`"14`" y=`"96`" class=`"ts`">Possible loot</text>"
  $i=0; foreach($l in $loot){ $ix=110+$i*32; $o += "<rect x=`"$($ix-2)`" y=`"78`" width=`"30`" height=`"30`" rx=`"6`" fill=`"#2E3A48`"/><image href=`"../icons/$($icon[$l]).svg`" x=`"$ix`" y=`"80`" width=`"26`" height=`"26`"/>"; $i++ }
  $o += "<rect x=`"14`" y=`"116`" width=`"$($w-28)`" height=`"24`" rx=`"8`" fill=`"#FFD34D`" stroke=`"#25282C`" stroke-width=`"2`"/><text x=`"$($w/2)`" y=`"133`" class=`"cb`">SEARCH  ($time)</text>"
  $o += "</g></g>"
  $o
}

function Expand-Hud([string]$t){
  $region=Get-Attr $t 'region'; $d=Get-Attr $t 'danger'; $hours=[int](Get-Attr $t 'hours'); $loot=Get-Attr $t 'loot'
  $o = "<g class=`"hud`"><rect x=`"16`" y=`"14`" width=`"300`" height=`"62`" rx=`"10`" fill=`"#1E2328`" fill-opacity=`".9`" stroke=`"#C9A24A`" stroke-width=`"2`"/>"
  $o += "<text x=`"30`" y=`"40`" class=`"hr`">$region</text><rect x=`"232`" y=`"26`" width=`"72`" height=`"20`" rx=`"10`" fill=`"$($dcol[$d])`" stroke=`"#25282C`" stroke-width=`"1.5`"/><text x=`"268`" y=`"40.5`" class=`"td`">$($dtxt[$d])</text>"
  $o += "<text x=`"30`" y=`"63`" class=`"hs`">Mostly: $loot</text>"
  $o += "<rect x=`"684`" y=`"14`" width=`"300`" height=`"46`" rx=`"10`" fill=`"#1E2328`" fill-opacity=`".9`" stroke=`"#C9A24A`" stroke-width=`"2`"/><text x=`"698`" y=`"34`" class=`"hs`">DAYLIGHT &#183; $hours h left</text>"
  for($k=0;$k -lt 12;$k++){ $f= if($k -lt $hours){'#FFD34D'}else{'#4A5260'}; $o += "<rect x=`"$(698+$k*23)`" y=`"41`" width=`"19`" height=`"11`" rx=`"3`" fill=`"$f`"/>" }
  $o += "<g transform=`"translate(790 630)`"><rect width=`"194`" height=`"50`" rx=`"12`" fill=`"#2E3A48`" stroke=`"#C9A24A`" stroke-width=`"2`"/><path d=`"M18 27 L30 16 L42 27 V38 H18 Z`" fill=`"#E0584A`" stroke=`"#25282C`" stroke-width=`"2.5`" stroke-linejoin=`"round`"/><text x=`"52`" y=`"24`" class=`"tn`">Return home</text><text x=`"52`" y=`"40`" class=`"ts`">teleport &#183; 1h</text></g>"
  $o += "<text x=`"400`" y=`"684`" text-anchor=`"middle`" class=`"hint`">Flashing things can be searched. Tap one to inspect it.</text></g>"
  $o
}

$style = @'
    <style>
      .tn{font:800 13px system-ui,'Segoe UI',sans-serif;fill:#FFFFFF}
      .ts{font:700 12px system-ui,'Segoe UI',sans-serif;fill:#E8D9A8}
      .td{font:900 10px system-ui,'Segoe UI',sans-serif;fill:#FFFFFF;text-anchor:middle;letter-spacing:1px}
      .cn{font:900 16px system-ui,'Segoe UI',sans-serif;fill:#FFFFFF;letter-spacing:.5px}
      .cd{font:italic 600 12px system-ui,'Segoe UI',sans-serif;fill:#B8B2A6}
      .cb{font:900 13px system-ui,'Segoe UI',sans-serif;fill:#1E2328;text-anchor:middle;letter-spacing:1.5px}
      .hr{font:900 18px system-ui,'Segoe UI',sans-serif;fill:#F3E6C0;letter-spacing:2px}
      .hs{font:700 12px system-ui,'Segoe UI',sans-serif;fill:#E8D9A8;letter-spacing:.5px}
      .hint{font:800 14px system-ui,'Segoe UI',sans-serif;fill:#FFFFFF;stroke:#1E2328;stroke-width:4;paint-order:stroke}
    </style>
    <!-- white "you can tap this" flash: a bright rim around the object plus a light sheen over it -->
    <filter id="flash" x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="fat"/>
      <feFlood flood-color="#FFFFFF" result="white"/>
      <feComposite in="white" in2="fat" operator="in" result="whiteFat"/>
      <feComposite in="whiteFat" in2="SourceAlpha" operator="out" result="rim"/>
      <feGaussianBlur in="rim" stdDeviation="1.2" result="rimSoft"/>
      <feComposite in="white" in2="SourceAlpha" operator="in" result="fill"/>
      <feComponentTransfer in="fill" result="sheen"><feFuncA type="linear" slope="0.38"/></feComponentTransfer>
      <feMerge><feMergeNode in="rimSoft"/><feMergeNode in="sheen"/></feMerge>
    </filter>
'@

Get-ChildItem $src -Filter *.svg | Where-Object { $_.Extension -eq '.svg' } | ForEach-Object {
  $s = [IO.File]::ReadAllText($_.FullName)
  $s = $s.Replace('<!--KIT2-->', $kit + "`n" + $style)
  if ($WithUI) { $s = [regex]::Replace($s, '<flash [^>]*/>', { param($m) Expand-Flash $m.Value }) } else { $s = [regex]::Replace($s, '\s*<flash [^>]*/>', '') }
  if ($WithUI) { $s = [regex]::Replace($s, '<card [^>]*/>', { param($m) Expand-Card $m.Value }) } else { $s = [regex]::Replace($s, '\s*<card [^>]*/>', '') }
  if ($WithUI) { $s = [regex]::Replace($s, '<hud [^>]*/>', { param($m) Expand-Hud $m.Value }) } else { $s = [regex]::Replace($s, '\s*<hud [^>]*/>', ''); $s = [regex]::Replace($s, '(?s)\s*<!--UI-->.*?<!--/UI-->', '') }
  $ok = $true
  try { [xml]$null = $s } catch { "BAD XML in $($_.TargetObject) : $($_.Exception.Message)"; $ok = $false }
  if ($ok) { [IO.File]::WriteAllText((Join-Path $root $_.Name), $s, $utf8); "built $($_.Name)" }
}
