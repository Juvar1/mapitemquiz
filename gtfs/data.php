<?php
// Simple GTFS Reader (C) 2024, Juha-Pekka Varjonen
header('Content-Type: application/json; charset=utf-8');

$db = $_GET['db'];
$func = $_GET['func'];
$var = (isset($_GET['var']))? $_GET['var']: '';
$result = [];

switch ($func) {
  case 'trips':
    $result = getFile($db . '.zip', 'trips.txt', $var);
    if ($db == 'helsinki') {
      $result[] = getFile($db . '.zip', 'trips2.txt', $var);
    }
    break;
  case 'routes':
  case 'stop_times':
  case 'stops':
  case 'shapes':
    $result = getFile($db . '.zip', $func . '.txt', $var);
    break;
  default:
    $result = 'Unknown command!';
}

echo json_encode($result);

function getFile($archive, $file, $q = '') {
  $keys = [];
  $data = [];
  $stream = fopen('zip://./' . $archive . '#' . $file, 'r');
  while (($row = fgetcsv($stream, 1000)) !== false) {
    set_time_limit(20); // Unfortunately this is very slow function
    if (count($keys) == 0) {
      $keys = $row;
      continue;
    }
    $r = [];
    foreach ($keys as $i => $key) { $r[$key] = $row[$i]; }
    if ($row[0] == $q || $q == '') $data[$row[0]][] = $r;
  }
  fclose($stream);
  return $data;
}
?>
