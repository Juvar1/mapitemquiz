/* MapItemQuiz - The Game
 * Copyright (C) 2024 Juha-Pekka Varjonen
 * jpvarjonen@gmail.com
 * https://www.mapitemquiz.fi
 */

const GeoPackageAPI = window.GeoPackage.GeoPackageAPI;
const setSqljsWasmLocateFile = window.GeoPackage.setSqljsWasmLocateFile;
const geoPackageCache = {};

var boundary = null;
var counter = 0;
var total = 30;
var questions = [];
var points = 0;
var invPoints = 0;
var cheats = false;
var cities = {turku: true, helsinki: false};

const city = () => {return Object.entries(cities).filter(f => f[1]).map(m => m[0])[0]};

var vectorTileStyling = {
			water: {
				fill: true,
				weight: 0,
				fillColor: 'hsl(205, 56%, 73%)',
				fillOpacity: 1,
				opacity: 1,
			},
			waterway: {
			  fill: true,
				weight: 0,
				color: 'hsl(205, 56%, 73%)',
				fillOpacity: 1,
				opacity: 1,
			},
			landcover: {
				fill: true,
				weight: 0,
				fillColor: 'hsl(82, 46%, 72%)',
				fillOpacity: 0.5,
				opacity: 0.5,
			},
			landuse: {
				fill: true,
				weight: 0,
				fillColor: 'hsl(47, 13%, 86%)',
				fillOpacity: 0.5,
				opacity: 0.5,
			},
			park: {
				fill: true,
				weight: 0,
				fillColor: 'hsl(82, 46%, 72%)',
				fillOpacity: 0.5,
				opacity: 0.5
			},
			boundary: {
				weight: 2,
				color: 'hsl(0, 0%, 76%)',
				fillOpacity: 0,
				opacity: 1
			},
			aeroway: {
				weight: 1.5,
				color: '#ffffff',
				opacity: 1
			},
			transportation: {
				weight: 1.5, 
				color: '#ffffff',
				opacity: 1,
			},
			building: {
				fill: true,
				weight: 1,
				fillColor: 'hsl(39, 41%, 86%)',
				color: 'hsl(36, 45%, 80%)',
			  fillOpacity: 1,
				opacity: 1
			},
			water_name: [],
			transportation_name: [],
			place: [], 
			housenumber: [], 
			poi: [],
			country_name: [],
			marine_name: [],
			state_name: [],
			place_name: [],
			waterway_name: [],
			//poi_name: [],
			road_name: [],
			housenum_name: [],
			aerodrome_label: [],
			mountain_peak: [],
		};

function geoPackageFeatureLayer(geoPackageUrl, options) {
  var layer = new L.GeoJSON([], {
    noCache: false,
    interactive: options.interactive,
    onEachFeature: options.onEachFeature,
    pointToLayer: options.pointToLayer,
    style: options.style
  });

  // Parse options for filename
  let varArr = geoPackageUrl.match(/(\{[\w\d]+\})+/g);
  while (varArr && varArr.length) {
    let original = varArr.pop();
    let variable = original.substr(1, original.length - 2);
    if (options[variable]) geoPackageUrl = geoPackageUrl.replace(original, options[variable]);
  }

  layer.changeSource = (geoPackageUrl2, layerName, callbackFunc = () => {}) => {
    
    layer.clearLayers();
    
    if (!options.noCache && geoPackageCache[geoPackageUrl2]) {
      layer.geoPackageLoaded = true;
      layer.geoPackage = geoPackageCache[geoPackageUrl2];
      const results = layer.geoPackage.iterateGeoJSONFeatures(layerName);
      for (let geoJson of results) {
        geoJson = {
          type: 'Feature',
          geometry: geoJson.geometry,
          id: geoJson.id,
          properties: geoJson.properties,
        };
        layer.addData(geoJson);
      }
      callbackFunc();
      return;
    }
    layer.geoPackageLoaded = false;
    const xhr = new XMLHttpRequest();
    xhr.open('GET', geoPackageUrl2, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function() {
      GeoPackageAPI.open(new Uint8Array(this.response)).then(function(gp) {
        layer.geoPackageLoaded = true;
        layer.geoPackage = gp;
        layer.layerName = layerName;
        geoPackageCache[geoPackageUrl2] = options.noCache || gp;
        const results = layer.geoPackage.iterateGeoJSONFeatures(layerName);
        for (let geoJson of results) {
          geoJson = {
            type: 'Feature',
            geometry: geoJson.geometry,
            id: geoJson.id,
            properties: geoJson.properties
          };
          layer.addData(geoJson);
        }
        callbackFunc();
      });
    };
    xhr.send();
  }
  if (geoPackageUrl) layer.changeSource(geoPackageUrl, options.layerName);
  return layer;
}

function gtfsLayerData(url, userfunc, options) {
  gtfsMetaData(url, (num, idx, arr) => {
    if (options.dataContent(num).type == 'Point') {
      return options.dataContent(num);
    } else if (idx > 0) {
      return; 
    } else if (idx == 0) {
      return {
       type: options.dataContent(num).type, 
       properties: options.dataContent(num).properties, 
       coordinates: Object.values(arr)
         .map(point => options.dataContent(point).coordinates)};
    }
  }).then(userfunc).catch(e => console.error(e));
}

function gtfsMetaData(url, userfunc) {
  return new Promise((resolve, reject) => {
    var json = {};
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    
    const dialog = document.querySelector("dialog");
    dialog.showModal();
    
    xhr.onload = function() {
      const results = JSON.parse(xhr.responseText);
      
      dialog.close();
      
      json = Object.values(results)
        .map((point, idx, arr) => userfunc(point, idx, arr));
      resolve(json.filter(s => s));
    };
    xhr.onabort = () => reject(xhr.status);
    xhr.onerror = () => reject(xhr.status);
    xhr.ontimeout = () => reject(xhr.status);
    xhr.send();
  });
}

const map = L.map('map', {
  center: [60.451690351, 22.266866666],
  zoom: 12,
  maxZoom: 18,
  worldCopyJump: true,
  attributionControl: true,
  zoomControl: true
});

// kind of a bug fix for a Leaflet.VectorGrid.Protobuf extension
L.VectorGrid.protobuf = function(url, options) {
    return new L.VectorGrid.Protobuf(url, options);
};

const baseOptions = {
  maxNativeZoom: 14,
  vectorTileLayerStyles: vectorTileStyling,
  attribution: 'MapItemQuiz.fi &copy; 2024 <a href="mailto:jpvarjonen@gmail.com">Juha-Pekka Varjonen</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
};

const baseTKU = L.VectorGrid.protobuf('./tilesPHP/tilesPHP.php?l=turku&z={z}&x={x}&y={y}', baseOptions).addTo(map);
const baseHKI = L.VectorGrid.protobuf('./tilesPHP/tilesPHP.php?l=helsinki&z={z}&x={x}&y={y}', baseOptions).addTo(map);

const allroads = geoPackageFeatureLayer('', {
  layerName: 'roads',
  interactive: false,
  style: function(feature) {
    return {
      fill: false,
      weight: 0,
      opacity: 0
    };
  }
});

var selectedRoad = L.polyline({lat: 0, lon: 0}, {interactive: false}).setStyle({weight: 3, opacity: 1}).addTo(map);

const roads = L.geoJson([], {
  interactive: true,
  onEachFeature: function(feature, layer) {
    layer.on({click: function(e) {
      
      // highlight answer
      selectedRoad.setLatLngs(getEveryPartFrom(roads._layers, e.target)).setStyle({color: '#000000'});
      
      // check the answer
      let correct = false;
      if (questions[counter].feature.properties.name.toLowerCase() == e.target.feature.properties.name.toLowerCase()) {
        points++;
        correct = true;
      }
      
      counter++;
      if (counter == total) {
        control.update('<span class="answer ' + correct + '">' + (correct?'OIKEIN':'VÄÄRIN') + '</span> Peli päättyi. Kokonaispisteet: ' + points + '/' + total + ' Aloita harjoitus valitsemalla alue kartalta.');
        points = 0;
        counter = 0;
        selectedRoad.setLatLngs({lat: 0, lon: 0});
        selectedRoad.removeFrom(map);
        featureGroup.removeFrom(map);
        boundaries.addTo(map);
        boundaries.bringToFront();
        return;
      }
      
      if (cheats) {
        setTimeout(() => selectedRoad.setLatLngs(getEveryPartFrom(roads._layers, questions[counter])).setStyle({color: '#00ff00'}), 2000);
      }
      control.update('Pisteet: '+ points +', tehtävä: ' + counter + '/'+ total + ' ' + '<span class="answer ' + correct + '">' + (correct?'OIKEIN':'VÄÄRIN') + '</span> Missä on ' + questions[counter].feature.properties.name + '?');
      
    }});
  },
  style: function(feature) {
    return {
      weight: 30,
      opacity: 0,
      fillOpacity: 0,
    };
  }
});

var featureGroup = L.featureGroup();

const neighborhoodMap = geoPackageFeatureLayer('', {
    layerName: 'boundaries',
    interactive: true,
    onEachFeature: function(feature, layer) {
      layer.on({click: function(e) {
        // highlight selected boundary
        featureGroup.clearLayers();
        featureGroup.addTo(map);
        L.polygon(e.target.getLatLngs(), {color: '#4444ff', fill: false, weight: 3, opacity: 1, fillOpacity: 0}).addTo(featureGroup);
        
        // Check the answer
        let text = 'Väärin.';
        if (e.target.feature.properties.name.toLowerCase() == questions[counter].toLowerCase()) {
          text = 'Oikein.';
          points++;
        }
        
        counter++;
        if (counter == total) {
          text += ' Peli päättyi.';
          neighborhoodMap.removeFrom(map);
          featureGroup.clearLayers();
          featureGroup.removeFrom(map);
        }
        
        if (cheats) {
          L.polygon(Object.values(neighborhoodMap.getLayers())
            .filter(f => f.feature.properties.name.toLowerCase() == questions[counter].toLowerCase())
            .map(m => m._latlngs),
            {color: '#44ff44', fill: false, weight: 3, opacity: 1, fillOpacity: 0}).addTo(featureGroup);
        }
        
        control.update(text + ' Pisteet: ' + points + '/' 
          + total + ((counter < total)? (', kysymys: ' + (counter + 1) + '/' 
          + total + ' | Valitse kartalta kohde ' + questions[counter]): ''));  
      }});
    },
    style: function(feature) {
      return {
        color: '#000000',
        weight: 3,
        opacity: 1,
        fill: true,
        fillOpacity: 0,
      };
    }
  });


const boundaries = geoPackageFeatureLayer('', {
  layerName: 'boundaries',
  interactive: true,
  onEachFeature: function(feature, layer) {
  
    layer.bindTooltip(feature.properties.name);
  
    layer.on({click: function(e) {
      boundary = e.target.getBounds();
      map.fitBounds(boundary.pad(0.05));
      selectRoadsFromAllRoads(e.target);
      boundaries.removeFrom(map);
      
      // highlight selected boundary
      featureGroup.clearLayers();
      featureGroup.addTo(map);
      L.polygon(e.target.getLatLngs(), {color: '#000000', fill: false, weight: 3, opacity: 1}).addTo(featureGroup);
      
      roads.addTo(map);
      selectedRoad.addTo(map);
            
      // strip duplicates for randomization
      let unshuffled = Object.values(roads._layers)
        .reduce((acc, curr) => {
          if (!acc.map(m => m.feature.properties.name).includes(curr.feature.properties.name)) {
            acc.push(curr);
          }
          return [acc].flat();
        }, [Object.values(roads._layers)[0]]);
      
      // fix length
      total = 30;
      if (total > unshuffled.length) total = unshuffled.length;
      
      // randomize questions
      questions = unshuffled
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value)
      
      if (cheats) {
        selectedRoad.setLatLngs(getEveryPartFrom(roads._layers, questions[counter])).setStyle({color: '#00ff00'});
      }
      control.update('Pisteet: '+ points +', tehtävä: ' + counter 
        + '/'+ total + ' </span> Missä on ' + questions[counter].feature.properties.name + '?');
    }});
  },
  style: function(feature) {
    return {
      color: '#000000',
      weight: 3,
      opacity: 1,
      fillOpacity: 0
    };
  }
});

const busstopsOptions = {
  noCache: false,
  interactive: true,
  dataContent: (num) => { return {
    type: 'Point',
    coordinates: [num[0].stop_lon, num[0].stop_lat],
    properties: num[0]
  }},
  onEachFeature: function(feature, layer) {
    layer.on({click: function(e) {
      var d = Object.values(buslines._layers).shift();
      let busstop = e.target.feature.geometry;
      if (d.feature.properties.stops.includes(e.target.feature.geometry.properties.stop_id)) {
        points++;
        busstop.properties.right = true;
      } else {
        invPoints++;
        busstop.properties.right = false;
      }
      busstops.addData(busstop);
      e.target.remove();
      total = d.feature.properties.stops.length;
      let completed = ['', ''];
      if (points == total) {
        completed[0] = 'Peli päättyi. ';
        completed[1] =  ' Aloita uusi peli valikosta.';
      }
      control.update(completed[0] + 'Oikein: ' + points + '/' + total 
        + ', Väärin: ' + invPoints + '/' + total + ' | ' 
        + Math.floor(100/total*(points-invPoints)) + '% oikein. | Reitin ' 
        + d.feature.geometry.properties.route_short_name + ' pysäkit suuntaan ' 
        + d.feature.geometry.properties.trip_headsign + '.' + completed[1]);
    }});
  },
  pointToLayer: function(point, latlng) {
    let col = '#000000';
    let act = true;
    if (point.properties.right) {
      col = '#00ff00';
      act = false;
    } else if (point.properties.right === false) {
      col = '#ff0000';
      act = false;
    }
    const marker = L.circleMarker(latlng, {interactive: act}).setRadius(15).setStyle({fill: true, opacity: 0.6, fillOpacity: 0.6, color: col});
    marker.bindTooltip(point.properties.stop_name);
    marker.on('mouseover', function(e) {
        e.target.openTooltip();
    });
    marker.on('mouseout', function(e) {
        e.target.closeTooltip();
    });
    return marker;
  },
  style: function(feature) {
    return {
      opacity: 0.6,
      fill: true,
      fillOpacity: 0.6
    };
  },
  attribution: ((city().toLowerCase() == 'turku')?'&copy; <a href="https://data.foli.fi/">Turku region public transport</a> <a href="https://creativecommons.org/licenses/by/4.0/deed.fi">(CC BY 4.0)</a>':'&copy; HSL 2024')
};

const busstops = new L.GeoJSON([], busstopsOptions);

function shapeIds2(route) {
  gtfsMetaData('/gtfs/data.php?db=' + city() + '&func=trips&var=' + route[0][0].route_id,  
    (point) => { return Object.values(point).map(p => {return {
      route_id: route[0][0].route_id,
      route_short_name: route[0][0].route_short_name,
      route_long_name: route[0][0].route_long_name,
      agency_id: route[0][0].agency_id,
      route_color: route[0][0].route_color,
      service_id: p.service_id,
      trip_id: p.trip_id,
      trip_headsign: p.trip_headsign,
      direction_id: p.direction_id,
      shape_id: p.shape_id
  }})}).then(addBusLine).catch(e => console.error(e));
}

function getRoute(route_short_name) {
  gtfsMetaData('/gtfs/data.php?db=' + city() + '&func=routes',
    (point) => { return point })
    .then(function (routeIds) {
      return Object.values(routeIds)
        .filter(k => {return k[0].route_short_name.toLowerCase() == route_short_name.toLowerCase()});
    })
    .then(shapeIds2)
    .catch(e => console.error(e));
}

function getRouteList() {
  gtfsMetaData('/gtfs/data.php?db=' + city() + '&func=routes', 
    (point) => { return point })
    .then(function (routeIds) {
      buslinesStartingPoints.clearLayers();
      control.update('Aloita harjoitus valitsemalla bussilinja <select name="buslines" id="selbusline" onchange="changeBusLine(event)">'
        + '<option value="">Linjaluettelo</option>\n'
        + Object.values(routeIds)
          .map(k => '<option value="' + k[0].route_short_name + '">' + k[0].route_short_name + ', ' + k[0].route_long_name + '</option>\n') + '</select>');
    })
    .catch(e => console.error(e));
}

function getRouteStops(tripId) {
  gtfsMetaData('/gtfs/data.php?db=' + city() + '&func=stop_times&var=' + tripId,
    (point) => { return point })
    .then(function (stopsData) {
      return Object.values(stopsData[0]).map(a => a.stop_id);
    })
    .then(function (routeStops) {
      gtfsLayerData('/gtfs/data.php?db=' + city() + '&func=stops',
        (data) => {
          
          let rndArr1 = Array.from({length: 250}, () => true);
          let rndArr2 = Array.from({length: data.length - rndArr1.length}, () => false);
          let rndArr = rndArr1.concat(rndArr2);
          // randomize
          rndArr = rndArr
            .map(value => ({ value, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ value }) => value);
          
          data
            .filter((d, idx) => routeStops.includes(d.properties.stop_id) || rndArr[idx])
            .forEach(d => busstops.addData(d));
            
        }, busstopsOptions);
      busstops.addTo(map);
      buslines.getLayers()[0].feature.properties.stops = routeStops;
    })
    .catch(e => console.error(e));
}

function changeBusLine(event) {
  if (event.target.value) {
    getRoute(event.target.value)
  } else return;
  control.update('Valitse kartalta reitin '+ event.target.value +' aloituspiste.');
  buslinesStartingPoints.addTo(map);
  map.off('click');
}

const buslinesOptions = {
  noCache: false,
  interactive: true,
  dataContent: (point) => { return {
    type: 'LineString',
    coordinates: point.map(p => { return [p.shape_pt_lon, p.shape_pt_lat]})
  }},
  pointToLayer: function(point, latlng) {
    
  },
  style: function(feature) {
    return {
      color: '#' + feature.geometry.properties.route_color,
      weight: 2,
      opacity: 1,
      fill: false
    };
  },
  attribution: ((city().toLowerCase() == 'turku')?'&copy; <a href="https://data.foli.fi/">Turku region public transport</a> <a href="https://creativecommons.org/licenses/by/4.0/deed.fi">(CC BY 4.0)</a>':'&copy; HSL 2024')
};

const buslinesStartingPointsOptions = {
  noCache: false,
  interactive: true,
  dataContent: (point) => { return {
    type: 'Point',
    coordinates: point.coordinates[0],
    properties: point.properties
  }},
  onEachFeature: function(feature, layer) {
    layer.on({click: function(e) {
      control.update('Valitse reitin ' + feature.properties.route_short_name + ' pysäkit kartalta suuntaan ' + feature.properties.trip_headsign + '.');
      buslinesStartingPoints.removeFrom(map);
      
      // Remove other buslines from map
      Object.values(buslines._layers)
        .filter(a => a.feature.geometry.properties.shape_id != feature.properties.shape_id)
        .forEach(a => buslines.removeLayer(a));
      if (cheats) buslines.addTo(map);
      map.fitBounds(buslines.getBounds());
      
      // get bus stops for selected line
      getRouteStops(feature.properties.trip_id);
    }});
  },
  pointToLayer: function(point, latlng) {
    const marker = L.circleMarker(latlng).setRadius(15);
    marker.bindPopup('Reitti: ' + point.properties.route_short_name + 
      ' - ' + point.properties.route_long_name + 
      '<br>Määränpää: ' + point.properties.trip_headsign);
    marker.on('mouseover', function(e) {
        e.target.openPopup();
    });
    marker.on('mouseout', function(e) {
        e.target.closePopup();
    });
    return marker;
  },
  style: function(feature) {
    return {
      color: '#' + feature.geometry.properties.route_color,
      opacity: 0.6,
      fill: true,
      fillColor: '#' + feature.geometry.properties.route_color,
      fillOpacity: 0.6
    };
  },
  attribution: ((city().toLowerCase() == 'turku')?'&copy; <a href="https://data.foli.fi/">Turku region public transport</a> <a href="https://creativecommons.org/licenses/by/4.0/deed.fi">(CC BY 4.0)</a>':'&copy; HSL 2024')
};

const buslines = new L.GeoJSON([], buslinesOptions);
const buslinesStartingPoints = new L.GeoJSON([], buslinesStartingPointsOptions);
function addBusLine(data) {
  let arr = Object.values(data[0])
    .reduce((acc, curr) => { // strip duplicate shape ID's
      if (!acc.map(m => m.shape_id).includes(curr.shape_id)) {
        acc.push(curr);
      }
      return [acc].flat();
    }, [data[0][0]]);
    
  arr.forEach(k => {
    gtfsLayerData('/gtfs/data.php?db=' + city() + '&func=shapes&var=' + k.shape_id, 
      (lines) => {
        lines[0].properties = k;
        lines[0].coordinates = lines[0].coordinates[0];
        buslines.addData(lines);
        buslinesStartingPoints.addData(buslinesStartingPointsOptions.dataContent(lines[0]));
      }, buslinesOptions);
  });
}

// Player control panel
var control = L.control();
control.onAdd = function(map) {
  this._div = L.DomUtil.create('div', 'leaflet-bar');
  this._div2 = L.DomUtil.create('div', 'play-control');
  var btn1 = L.DomUtil.create('a', 'button');
  var div3 = L.DomUtil.create('div', 'main-dropdown-content');
  btn1.innerHTML = '&#9776;';
  btn1.onclick = function(event) {
    document.getElementsByClassName('main-dropdown-content')[0].classList.toggle('show');
    event.stopPropagation();
  }
  div3.innerHTML = '<a href="#" id="cityselection" onclick="selectedCity()"><span class="' + cities.turku + '">TKU</span> | <span class="' + cities.helsinki + '">HKI</span></a><a href="#" onclick="menuitem(event, 1)">Lähikunnat</a><a href="#" onclick="menuitem(event, 2)">Kaupunginosat</a><a href="#" onclick="menuitem(event, 3)">Tärkeimmät tiet</a><a href="#" onclick="menuitem(event, 4)">Bussilinjat</a><a href="/">Ohjeita ja tietoja</a>';
  this._div.appendChild(this._div2);
  this._div.appendChild(btn1);
  this._div.appendChild(div3);
  this.update();
  return this._div;
};
control.update = function(props) {
  this._div2.innerHTML = props;
};
control.addTo(map);
control.update('Valitse haluamasi harjoitus valikosta.');

function selectedCity() {
  event.stopPropagation();
  if (cities.turku) {
    cities.turku = false;
    cities.helsinki = true;
    map.setView([60.166640739, 24.943536799]);
  } else {
    cities.turku = true;
    cities.helsinki = false;
    map.setView([60.451690351, 22.266866666]);
  }
  document.getElementById('cityselection').innerHTML = 
    '<span class="' + cities.turku + '">TKU</span> | <span class="' + cities.helsinki + '">HKI</span>';
}

function randomizeQuestions() {
  // randomize questions
  questions = neighborhoodMap.getLayers()
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value.feature.properties.name);
  // limit count
  total = (questions.length < 15)? questions.length: 15;
  // start game
  control.update('Kysymys: 1/' + total + ' | Valitse kartalta kohde ' + questions[0]);
}

function menuitem(event, option) {
  event.stopPropagation();
  document.getElementsByClassName('main-dropdown-content')[0].classList.toggle('show');
  if (counter > 0 && counter <= total) {
    // TODO kysy lopetetaanko peli kesken
  }
  counter = 0;
  points = 0;
  question = null;
  busstops.removeFrom(map);
  boundaries.removeFrom(map);
  roads.removeFrom(map);
  selectedRoad.removeFrom(map);
  featureGroup.removeFrom(map);
  neighborhoodMap.removeFrom(map);
  
  if (option == 1) {
    neighborhoodMap.changeSource(city() + '-municipalities.gpkg', 'municipalities', randomizeQuestions);
    neighborhoodMap.addTo(map);
  } else if (option == 2) {
    neighborhoodMap.changeSource(city() + '.gpkg', 'boundaries', randomizeQuestions);
    neighborhoodMap.addTo(map);
  } else if (option == 3) { // street name game
    allroads.changeSource(city() + '-roads.gpkg', 'roads');
    control.update('Aloita harjoitus valitsemalla alue kartalta.');
    total = 30;
    boundaries.changeSource(city() + '.gpkg','boundaries');
    boundaries.addTo(map);
  } else if (option == 4) { // bus route game
    getRouteList();
  }
}

function getEveryPartFrom(layers, selection) {
  return Object.values(layers)
    .filter(k => k.feature.properties.name && selection.feature.properties.name) // is set
    .filter(k => k.feature.properties.name.toLowerCase() == 
       selection.feature.properties.name.toLowerCase())
    .map(k => k._latlngs);
}

function selectRoadsFromAllRoads(target) {
  roads.clearLayers();
  var polygon = Object.values(target.getLatLngs()[0][0]).map(m => map.latLngToLayerPoint(m))
  Object.values(allroads._layers)
    .filter(k => Object.values(k.getLatLngs()).some(f => relationPP(map.latLngToLayerPoint(f), polygon)))
    .forEach(k => roads.addData(k.feature));
}

// ray casting algorithm
// P = point to check, polygon = array of points
// returns false: outside, 0: on edge, true: inside
function relationPP(P, polygon) {
  const between = (p, a, b) => p >= a && p <= b || p <= a && p >= b;
  let inside = false;
  for (let i = polygon.length - 1, j = 0; j < polygon.length; i = j, j++) {
    const A = polygon[i];
    const B = polygon[j];
    // corner cases
    if (P.x == A.x && P.y == A.y || P.x == B.x && P.y == B.y) return 0;
    if (A.y == B.y && P.y == A.y && between(P.x, A.x, B.x)) return 0;

    if (between(P.y, A.y, B.y)) { // if P inside the vertical range
      // filter out "ray pass vertex" problem by treating the line a little lower
      if (P.y == A.y && B.y >= A.y || P.y == B.y && A.y >= B.y) continue;
      // calc cross product `PA X PB`, P lays on left side of AB if c > 0 
      const c = (A.x - P.x) * (B.y - P.y) - (B.x - P.x) * (A.y - P.y);
      if (c == 0) return 0;
      if ((A.y < B.y) == (c > 0)) inside = !inside;
    }
  }
  return inside;
}
