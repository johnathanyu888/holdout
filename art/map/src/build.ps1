# Builds art/map/world_map.svg from map_template.svg + the shared kit + forest.svgfrag.
#  <!--KIT2-->    shared asset kit (art/kit/kit2.svgfrag)
#  <!--BANDS-->   rows of trees above and below the regions
#  <!--FOREST-->  the forest between the regions
# Every tree is nudged off its row and resized with a fixed seed, so the result is repeatable.
$src  = $PSScriptRoot
$map  = Split-Path $src -Parent
$art  = Split-Path $map -Parent
$out  = Join-Path $map 'world_map.svg'
$utf8 = New-Object Text.UTF8Encoding $false
$s = [IO.File]::ReadAllText((Join-Path $src 'map_template.svg'))

# kit assets (the map defines its own warm/cyan gradients)
$kit = [IO.File]::ReadAllText((Join-Path $art 'kit\kit2.svgfrag'))
$kit = ($kit -split "`n" | Where-Object { $_ -notmatch 'radialGradient id="(warm|cyan)"' }) -join "`n"
$s = $s.Replace('<!--KIT2-->', $kit.TrimEnd())

function Get-Use($h,$x,$y){ "<use href=`"#$h`" x=`"$x`" y=`"$y`"/>" }
$rows = @(
 @(@('pn',70,75),@('tr',125,78),@('pn',180,72),@('pn',235,80),@('tr',290,74),@('pn',345,78),@('pn',400,72),@('tr',455,80),@('pn',510,75),@('pn',555,85),@('tr',612,80),@('tr',660,78),@('pn',715,72),@('pn',770,80),@('tr',825,74),@('pn',880,78),@('pn',935,72),@('tr',990,80),@('pn',1045,75),@('pn',1100,78),@('tr',1140,90)),
 @(@('tr',95,130),@('pn',150,128),@('pn',205,134),@('tr',260,128),@('pn',315,132),@('pn',370,126),@('tr',425,134),@('pn',480,128),@('pn',540,135),@('tr',610,132),@('pn',680,130),@('tr',735,126),@('pn',790,134),@('pn',845,128),@('tr',900,132),@('pn',955,126),@('pn',1010,134),@('tr',1065,128),@('pn',1120,132)),
 @(@('pn',65,185),@('pn',120,190),@('tr',175,186),@('pn',230,192),@('pn',340,188),@('tr',395,192),@('pn',450,186),@('pn',505,192),@('tr',560,186),@('pn',630,190),@('tr',690,188),@('pn',745,192)),
 @(@('pn',70,1030),@('tr',125,1036),@('pn',180,1028),@('pn',235,1034),@('tr',290,1030),@('pn',345,1036),@('pn',400,1028),@('tr',455,1034),@('pn',1105,1036)),
 @(@('tr',95,1088),@('pn',150,1084),@('pn',205,1090),@('tr',260,1086),@('pn',315,1092),@('pn',370,1084),@('tr',425,1090),@('pn',480,1086),@('pn',552,1086),@('pn',625,1088),@('tr',680,1084),@('pn',735,1090),@('pn',790,1086),@('tr',845,1092),@('pn',900,1084),@('pn',955,1090),@('tr',1010,1086),@('pn',1065,1092),@('pn',1120,1084)),
 @(@('pn',70,1140),@('tr',125,1145),@('pn',180,1138),@('pn',290,1142),@('tr',345,1146),@('pn',455,1140),@('pn',505,1146),@('tr',577,1140),@('tr',650,1142),@('pn',705,1138),@('pn',815,1144),@('tr',870,1140),@('pn',980,1146),@('pn',1035,1138),@('tr',1130,1144))
)
$band = "  <g>`n"
foreach($row in $rows){ $band += '    ' + (($row | ForEach-Object { Get-Use $_[0] $_[1] $_[2] }) -join '') + "`n" }
$band += "  </g>"
$s = $s.Replace('<!--BANDS-->', $band)

$forest = [IO.File]::ReadAllText((Join-Path $src 'forest.svgfrag'))
foreach($t in '<use href="#pn" x="1020" y="650"/>','<use href="#tr" x="1070" y="660"/>','<use href="#pn" x="1040" y="700"/>','<use href="#tr" x="1095" y="705"/>','<use href="#pn" x="1060" y="745"/>','<use href="#pn" x="486" y="650"/>','<use href="#tr" x="505" y="722"/>','<use href="#pn" x="525" y="784"/>','<use href="#pn" x="462" y="700"/>','<use href="#tr" x="468" y="765"/>'){ $forest = $forest.Replace($t,'') }
$forest += '  <use href="#pn" x="1030" y="655"/><use href="#tr" x="1078" y="668"/><use href="#pn" x="1046" y="712"/><use href="#tr" x="1100" y="716"/><use href="#pn" x="1064" y="760"/><use href="#tr" x="492" y="652"/><use href="#pn" x="470" y="712"/><use href="#tr" x="508" y="780"/><use href="#tr" x="1000" y="640"/><use href="#pn" x="1004" y="720"/><use href="#tr" x="990" y="800"/>' + "`n"
$s = $s.Replace('<!--FOREST-->', $forest)

$rnd = New-Object System.Random 11
$s = [regex]::Replace($s, '<use href="#(tr|pn)" x="(-?\d+)" y="(-?\d+)"/>', {
  param($m)
  $x = [int]$m.Groups[2].Value + $rnd.Next(-18,19); $y = [int]$m.Groups[3].Value + $rnd.Next(-16,17)
  $k = [Math]::Round(0.82 + $rnd.NextDouble()*0.4, 2)
  "<use href=`"#$($m.Groups[1].Value)`" transform=`"translate($x $y) scale($k)`"/>"
})

# drop trees that sit on the dunes (band trees are absolute, the rest are shifted 185 down)
function Remove-CoveredTrees([string]$txt,[double]$cx,[double]$cy){
  [regex]::Replace($txt,'<use href="#(tr|pn)" transform="translate\((-?\d+) (-?\d+)\)[^"]*"/>',{
    param($m); $x=[double]$m.Groups[2].Value; $y=[double]$m.Groups[3].Value
    $dx=[Math]::Abs($x-$cx)/258; $dy=[Math]::Abs($y-$cy)/186
    if([Math]::Pow($dx,4)+[Math]::Pow($dy,4) -lt 1){ '' } else { $m.Value } })
}
$k = $s.IndexOf('  <g transform="translate(0 185)">')
$s = (Remove-CoveredTrees $s.Substring(0,$k) 745 938) + (Remove-CoveredTrees $s.Substring($k) 745 753)

if ([string]::IsNullOrWhiteSpace($s)) { throw 'build produced nothing; not writing' }
[xml]$null = $s
[IO.File]::WriteAllText($out, $s, $utf8)
"wrote $out"
