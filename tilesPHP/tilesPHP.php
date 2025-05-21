<?php

// TilesPHP
// Simplified tile server for dummies
// Copyright (C) 2024 Juha-Pekka Varjonen
//
// Base functionality taken from:
//   TileServer-PHP project
//   https://github.com/maptiler/tileserver-php/
//   Copyright (C) 2020 - MapTiler AG
// 

global $config;
$config['availableFormats'] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pbf', 'hybrid'];
$config['dataRoot'] = getcwd();
/**
 * Server base
 */
class Server {

  /**
   * Configuration of TileServer
   * @var array
   */
  public $config;

  /**
   * Datasets stored in file structure
   * @var array
   */
  public $fileLayer = [];

  /**
   * Datasets stored in database
   * @var array
   */
  public $dbLayer = [];

  /**
   * PDO database connection
   * @var object
   */
  public $db;

  /**
   * Set config
   */
  public function __construct() {
    $this->config = $GLOBALS['config'];

    if($this->config['dataRoot'] != ''
       && substr($this->config['dataRoot'], -1) != '/' ){
      $this->config['dataRoot'] .= '/';
    }
  }

  /**
   * Looks for datasets
   */
  public function setDatasets() {
    $mbts = glob($this->config['dataRoot'] . '*.mbtiles');

    if ($mbts) {
      foreach (array_filter($mbts, 'is_readable') as $mbt) {
        $this->dbLayer[] = $this->metadataFromMbtiles($mbt);
      }
    }
  }

  /**
   * Testing if is a database layer
   * @param string $layer
   * @return boolean
   */
  public function isDBLayer($layer) {
    if (is_file($this->config['dataRoot'] . $layer . '.mbtiles')) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Testing if is a file layer
   * @param string $layer
   * @return boolean
   */
  public function isFileLayer($layer) {
    if (is_dir($layer)) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Loads metadata from MBtiles
   * @param string $mbt
   * @return object
   */
  public function metadataFromMbtiles($mbt) {
    $metadata = [];
    $this->DBconnect($mbt);
    $result = $this->db->query('select * from metadata');

    $resultdata = $result->fetchAll();
    foreach ($resultdata as $r) {
      $value = preg_replace('/(\\n)+/', '', $r['value']);
      $metadata[$r['name']] = addslashes($value);
    }
    if (!array_key_exists('minzoom', $metadata)
    || !array_key_exists('maxzoom', $metadata)
    ) {
      // autodetect minzoom and maxzoom
      $result = $this->db->query('select min(zoom_level) as min, max(zoom_level) as max from tiles');
      $resultdata = $result->fetchAll();
      if (!array_key_exists('minzoom', $metadata)){
        $metadata['minzoom'] = $resultdata[0]['min'];
      }
      if (!array_key_exists('maxzoom', $metadata)){
        $metadata['maxzoom'] = $resultdata[0]['max'];
      }
    }
    // autodetect format using JPEG magic number FFD8
    if (!array_key_exists('format', $metadata)) {
      $result = $this->db->query('select hex(substr(tile_data,1,2)) as magic from tiles limit 1');
      $resultdata = $result->fetchAll();
      $metadata['format'] = ($resultdata[0]['magic'] == 'FFD8')
        ? 'jpg'
        : 'png';
    }
    // autodetect bounds
    if (!array_key_exists('bounds', $metadata)) {
      $result = $this->db->query('select min(tile_column) as w, max(tile_column) as e, min(tile_row) as s, max(tile_row) as n from tiles where zoom_level='.$metadata['maxzoom']);
      $resultdata = $result->fetchAll();
      $w = -180 + 360 * ($resultdata[0]['w'] / pow(2, $metadata['maxzoom']));
      $e = -180 + 360 * ((1 + $resultdata[0]['e']) / pow(2, $metadata['maxzoom']));
      $n = $this->row2lat($resultdata[0]['n'], $metadata['maxzoom']);
      $s = $this->row2lat($resultdata[0]['s'] - 1, $metadata['maxzoom']);
      $metadata['bounds'] = implode(',', [$w, $s, $e, $n]);
    }
    $mbt = explode('.', $mbt);
    $metadata['basename'] = $mbt[0];
    $metadata = $this->metadataValidation($metadata);
    return $metadata;
  }

  /**
   * Convert row number to latitude of the top of the row
   * @param integer $r
   * @param integer $zoom
   * @return integer
   */
   public function row2lat($r, $zoom) {
     $y = $r / pow(2, $zoom - 1 ) - 1;
     return rad2deg(2.0 * atan(exp(3.191459196 * $y)) - 1.57079632679489661922);
   }

  /**
   * Valids metaJSON
   * @param object $metadata
   * @return object
   */
  public function metadataValidation($metadata) {
    if (!array_key_exists('bounds', $metadata)) {
      $metadata['bounds'] = [-180, -85.06, 180, 85.06];
    } elseif (!is_array($metadata['bounds'])) {
      $metadata['bounds'] = array_map('floatval', explode(',', $metadata['bounds']));
    }
    if (!array_key_exists('profile', $metadata)) {
      $metadata['profile'] = 'mercator';
    }
    if (array_key_exists('minzoom', $metadata)){
      $metadata['minzoom'] = intval($metadata['minzoom']);
    }else{
      $metadata['minzoom'] = 0;
    }
    if (array_key_exists('maxzoom', $metadata)){
      $metadata['maxzoom'] = intval($metadata['maxzoom']);
    }else{
      $metadata['maxzoom'] = 18;
    }
    if (!array_key_exists('format', $metadata)) {
      if(array_key_exists('tiles', $metadata)){
        $pos = strrpos($metadata['tiles'][0], '.');
        $metadata['format'] = trim(substr($metadata['tiles'][0], $pos + 1));
      }
    }
    $formats = $this->config['availableFormats'];
    if(!in_array(strtolower($metadata['format']), $formats)){
        $metadata['format'] = 'png';
    }
    if (!array_key_exists('scale', $metadata)) {
      $metadata['scale'] = 1;
    }
    return $metadata;
  }

  /**
   * SQLite connection
   * @param string $tileset
   */
  public function DBconnect($tileset) {
    try {
      $this->db = new PDO('sqlite:' . $tileset, '', '', [PDO::ATTR_PERSISTENT => true]);
    } catch (Exception $exc) {
      echo $exc->getTraceAsString();
      die;
    }

    if (!isset($this->db)) {
      header('Content-type: text/plain');
      echo 'Incorrect tileset name: ' . $tileset;
      die;
    }
  }

  /**
   * Check if file is modified and set Etag headers
   * @param string $filename
   * @return boolean
   */
  public function isModified($filename) {
    $filename = $this->config['dataRoot'] . $filename . '.mbtiles';
    $lastModifiedTime = filemtime($filename);
    $eTag = md5($lastModifiedTime);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $lastModifiedTime) . ' GMT');
    header('Etag:' . $eTag);
    if (@strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) == $lastModifiedTime ||
            @trim($_SERVER['HTTP_IF_NONE_MATCH']) == $eTag) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Returns tile of dataset
   * @param string $tileset
   * @param integer $z
   * @param integer $y
   * @param integer $x
   * @param string $ext
   */
  public function renderTile($tileset, $z, $y, $x, $ext) {
    if ($this->isDBLayer($tileset)) {
      if ($this->isModified($tileset) == true) {
        header('Access-Control-Allow-Origin: *');
        header('HTTP/1.1 304 Not Modified');
        die;
      }
      $this->DBconnect($this->config['dataRoot'] . $tileset . '.mbtiles');
      $z = floatval($z);
      $y = floatval($y);
      $x = floatval($x);
      $flip = true;
      if ($flip) {
        $y = pow(2, $z) - 1 - $y;
      }
      
      $sql = "SELECT tile_data FROM tiles WHERE zoom_level = $z AND tile_column = $x AND tile_row = $y";
      $result = $this->db->prepare($sql);
      $result->execute();
      $result->bindColumn(1, $data, PDO::PARAM_LOB);
      $result->fetch(PDO::FETCH_BOUND);


      if (!isset($data) || $data === false) {
        //if tile doesn't exist
        //select scale of tile (for retina tiles)
        $result = $this->db->query('select value from metadata where name="scale"');
        $resultdata = $result->fetchColumn();
        $scale = isset($resultdata) && $resultdata !== false ? $resultdata : 1;
        $this->getCleanTile($scale, $ext);
      } else {
        $result = $this->db->query('select value from metadata where name="format"');
        $resultdata = $result->fetchColumn();
        $format = isset($resultdata) && $resultdata !== false ? $resultdata : 'png';
        if ($format == 'jpg') {
          $format = 'jpeg';
        }

        if ($format == 'pbf') {
          header('Content-type: application/x-protobuf');
          //header('Content-Encoding:gzip');
          
          // Read file until EOF, remove header and footer (bug in PHP) and then uncompress it
          //  - uncompression doesn't work without removing gzip header and footer :/
          // PHP default memory buffer limit = 2**28
          echo gzinflate(substr(fread($data, 2**27), 10, -8));
 
        } else {
          header('Content-type: image/' . $format);
          header('Access-Control-Allow-Origin: *');
          echo $data;
        }
      }
    } else {
      header('HTTP/1.1 404 Not Found');
      echo 'Server: Unknown or not specified dataset "' . $tileset . '"';
      die;
    }
  }

  /**
   * Returns clean tile
   * @param integer $scale Default 1
   */
  public function getCleanTile($scale = 1, $format = 'png') {
    switch ($format) {
      case 'pbf':
        header('Access-Control-Allow-Origin: *');
        header('HTTP/1.1 204 No Content');
        header('Content-Type: application/json; charset=utf-8');
        break;
      case 'webp':
        header('Access-Control-Allow-Origin: *');
        header('Content-type: image/webp');
        echo base64_decode('UklGRhIAAABXRUJQVlA4TAYAAAAvQWxvAGs=');
        break;
      case 'jpg':
        header('Access-Control-Allow-Origin: *');
        header('Content-type: image/jpg');
        echo base64_decode('/9j/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=');
        break;
      case 'png':
      default:
        header('Access-Control-Allow-Origin: *');
        header('Content-type: image/png');
        // 256x256 transparent optimised png tile
        echo pack('H*', '89504e470d0a1a0a0000000d494844520000010000000100010300000066bc3a2500000003504c5445000000a77a3dda0000000174524e530040e6d8660000001f494441541819edc1010d000000c220fba77e0e37600000000000000000e70221000001f5a2bd040000000049454e44ae426082');
        break;
    }
    die;
  }

}

$config['protocol'] = ((isset($_SERVER['HTTPS']) or (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443))) ? 'https' : 'http';

$z = $_GET['z'];
$x = $_GET['x'];
$y = $_GET['y'];
$layer = $_GET['l'];

$serverInstance = new Server;
$serverInstance->renderTile($layer, $z, $y, $x, 'pbf');

