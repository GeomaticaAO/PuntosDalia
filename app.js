// ======================================
// CONFIGURACIÓN Y VARIABLES GLOBALES
// ======================================
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRKAQcfj6fUWGt0H9phsiMs5TYWD8CquxOr-hAlfFPyM4tqMMJePNnSGYOUp5eb6g/pub?output=csv';

// Proxy CORS para evitar errores cuando se abre directamente
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

let map;
let markersLayer;
let allMarkers = [];
let filteredMarkers = []; // Marcadores actualmente visibles
let allData = [];
let userLocationMarker = null;
let userLocationCircle = null;
let limiteAlcaldiaLayer = null;
let ejesVialesData = null;
let rutaActual = null;

// ======================================
// INICIALIZACIÓN
// ======================================
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    initEventListeners();
    loadData();
});

// ======================================
// INICIALIZACIÓN DEL MAPA
// ======================================
function initMap() {
    // Crear el mapa centrado en Ciudad de México
    map = L.map('map', {
        center: [19.344796609, -99.238588729],
        zoom: 13,
        minZoom: 10,
        maxZoom: 19,
        zoomControl: true,
        tap: true,
        tapTolerance: 15
    });

    // Mover controles de zoom a la derecha
    map.zoomControl.setPosition('topright');

    // Capa base de OpenStreetMap
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    });

    // Capa satelital
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    });

    // Agregar capa por defecto
    osmLayer.addTo(map);

    // Control de capas
    const baseMaps = {
        "Mapa": osmLayer,
        "Satélite": satelliteLayer
    };
    L.control.layers(baseMaps).addTo(map);

    // Inicializar capa de marcadores (sin agrupación)
    markersLayer = L.layerGroup().addTo(map);

    // Cargar límite de la alcaldía
    loadLimiteAlcaldia();
    
    // Cargar ejes viales
    loadEjesViales();
}

// ======================================
// EVENT LISTENERS
// ======================================
function initEventListeners() {
    // Menú lateral
    const menuBtn = document.getElementById('menuBtn');
    const closePanel = document.getElementById('closePanel');
    const overlay = document.getElementById('overlay');
    const sidePanel = document.getElementById('sidePanel');

    menuBtn.addEventListener('click', openPanel);
    closePanel.addEventListener('click', closePanel_);
    overlay.addEventListener('click', closePanel_);

    function openPanel() {
        sidePanel.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closePanel_() {
        sidePanel.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Botón de ubicación
    const locationBtn = document.getElementById('locationBtn');
    locationBtn.addEventListener('click', getUserLocation);
    
    // Botón de punto más cercano
    const nearestBtn = document.getElementById('nearestBtn');
    nearestBtn.addEventListener('click', findNearestPuntoDalia);

    // Filtros
    const searchInput = document.getElementById('searchInput');
    const tipoFilter = document.getElementById('tipoFilter');

    searchInput.addEventListener('input', handleSearchInput);
    tipoFilter.addEventListener('change', filterMarkers);
    
    // Cerrar autocomplete al hacer click fuera
    document.addEventListener('click', function(e) {
        const autocompleteList = document.getElementById('autocompleteList');
        if (!e.target.closest('.autocomplete-wrapper')) {
            autocompleteList.classList.remove('active');
        }
    });
}

// ======================================
// MANEJO DE AUTOCOMPLETADO
// ======================================
function handleSearchInput(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    const autocompleteList = document.getElementById('autocompleteList');
    
    // Limpiar lista
    autocompleteList.innerHTML = '';
    
    if (searchTerm === '') {
        autocompleteList.classList.remove('active');
        filterMarkers();
        return;
    }
    
    // Buscar coincidencias
    const matches = allMarkers.filter(item => {
        const nombre = (item.data['Nombre del punto Dalia'] || '').toLowerCase();
        return nombre.includes(searchTerm);
    }).slice(0, 8); // Limitar a 8 sugerencias
    
    if (matches.length === 0) {
        autocompleteList.innerHTML = '<div class="autocomplete-no-results">No se encontraron puntos</div>';
        autocompleteList.classList.add('active');
        filterMarkers();
        return;
    }
    
    // Crear elementos de sugerencias
    matches.forEach(item => {
        const nombre = item.data['Nombre del punto Dalia'] || '';
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        
        // Resaltar la parte que coincide
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const nombreResaltado = nombre.replace(regex, '<strong>$1</strong>');
        div.innerHTML = nombreResaltado;
        
        div.addEventListener('click', function() {
            document.getElementById('searchInput').value = nombre;
            autocompleteList.classList.remove('active');
            filterMarkers();
            
            // Centrar mapa en el marcador seleccionado
            map.setView(item.marker.getLatLng(), 16);
            item.marker.openPopup();
        });
        
        autocompleteList.appendChild(div);
    });
    
    autocompleteList.classList.add('active');
    filterMarkers();
}

// ======================================
// CARGA DEL LIMITE DE LA ALCALDIA
// ======================================
function loadLimiteAlcaldia() {
    console.log('Intentando cargar limite de alcaldia...');
    fetch('archivos/limite_alcaldia.geojson')
        .then(response => {
            console.log('Respuesta del archivo:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('GeoJSON cargado:', data);
            limiteAlcaldiaLayer = L.geoJSON(data, {
                style: {
                    color: '#922B21',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0,
                    dashArray: '0'
                },
                interactive: false,
                pane: 'overlayPane'
            }).addTo(map);
            
            // Ajustar vista al limite
            map.fitBounds(limiteAlcaldiaLayer.getBounds());
            
            console.log('Limite de alcaldia cargado y agregado al mapa');
        })
        .catch(error => {
            console.error('Error al cargar el limite de la alcaldia:', error);
        });
}

// ======================================
// CARGA DE EJES VIALES
// ======================================
function loadEjesViales() {
    console.log('Cargando ejes viales...');
    fetch('archivos/ejes_viales.geojson')
        .then(response => response.json())
        .then(data => {
            ejesVialesData = data;
            console.log('✅ Ejes viales cargados:', data.features.length, 'segmentos');
        })
        .catch(error => {
            console.warn('⚠️ No se pudieron cargar los ejes viales:', error);
        });
}

// ======================================
// CARGA DE

// ======================================
// CARGA DE DATOS
// ======================================
function loadData() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    loadingIndicator.classList.add('active');

    // Intentar primero sin proxy
    Papa.parse(CSV_URL, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            console.log('✅ Datos cargados:', results.data.length, 'registros');
            allData = results.data;
            processData(results.data);
            loadingIndicator.classList.remove('active');
        },
        error: function(error) {
            console.warn('⚠️ Error con URL directa, intentando con proxy CORS...', error);
            // Si falla, intentar con proxy CORS
            loadDataWithProxy();
        }
    });
}

// Función alternativa con proxy CORS
function loadDataWithProxy() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    Papa.parse(CORS_PROXY + encodeURIComponent(CSV_URL), {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            console.log('✅ Datos cargados con proxy:', results.data.length, 'registros');
            allData = results.data;
            processData(results.data);
            loadingIndicator.classList.remove('active');
        },
        error: function(error) {
            console.error('❌ Error al cargar datos:', error);
            loadingIndicator.classList.remove('active');
            alert('Error al cargar los puntos Dalia.\n\nPosibles causas:\n- Sin conexión a Internet\n- Google Sheets no está publicado\n- Bloqueador de anuncios activo\n\nPor favor, intenta recargar la página.');
        }
    });
}

// ======================================
// PROCESAMIENTO DE DATOS
// ======================================
function processData(data) {
    const tipos = new Set();
    
    data.forEach(row => {
        const lat = parseFloat(row['Latitud']);
        const lng = parseFloat(row['Longitud']);
        
        if (isNaN(lat) || isNaN(lng)) {
            console.warn('Coordenadas inválidas:', row);
            return;
        }

        // Recopilar tipos únicos
        const tipo = row['Tipo']?.trim() || 'No especificado';
        tipos.add(tipo);

        // Crear marcador
        const marker = createMarker(row, lat, lng);
        allMarkers.push({ marker, data: row });
        markersLayer.addLayer(marker);
    });

    // Actualizar filtros
    updateFilters(tipos);
    updateInfo();
}

// ======================================
// CREACIÓN DE MARCADORES
// ======================================
function createMarker(data, lat, lng) {
    // Icono personalizado desde img/icono_dalia.png
    const icon = L.icon({
        iconUrl: 'img/icono_dalia.png',
        iconSize: [35, 35],
        iconAnchor: [17, 35],
        popupAnchor: [0, -35]
    });

    const marker = L.marker([lat, lng], { icon });
    
    // Crear contenido del popup
    const popupContent = createPopupContent(data);
    marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
    });

    return marker;
}

// ======================================
// CONTENIDO DEL POPUP
// ======================================
function createPopupContent(data) {
    const nombre = data['Nombre del punto Dalia'] || 'Sin nombre';
    const numeroPunto = data['Punto Dalia'] || data['Número'] || data['ID'] || '';
    const tipo = data['Tipo'] || '';
    const horario = data['Horario de atención'] || '';
    const direccion = data['Dirección'] || '';
    const colonia = data['Colonia'] || '';
    const contacto = data['Contacto'] || '';
    const googleMapsLink = data['Link de Google Maps'] || '';

    let content = `<div class="popup-content-custom">`;
    
    // Título con número en círculo
    if (numeroPunto) {
        content += `
            <div class="popup-header-with-number">
                <span class="punto-dalia-number">${numeroPunto}</span>
                <h3>${nombre}</h3>
            </div>
        `;
    } else {
        content += `<h3>${nombre}</h3>`;
    }
    
    if (tipo) {
        content += `<p><strong><i class="fas fa-tag"></i> Tipo:</strong> ${tipo}</p>`;
    }
    
    if (horario) {
        content += `<p><strong><i class="fas fa-clock"></i> Horario:</strong> ${horario}</p>`;
    }
    
    if (direccion) {
        content += `<p><strong><i class="fas fa-map-marker"></i> Dirección:</strong> ${direccion}</p>`;
    }
    
    if (colonia) {
        content += `<p><strong><i class="fas fa-home"></i> Colonia:</strong> ${colonia}</p>`;
    }
    
    if (contacto) {
        // Detectar patrón: número (ext. X) número
        const patron = /(\d+)\s*\(ext\.?\s*(\d+)\)/gi;
        let resultado = contacto;
        let numerosHTML = [];
        
        // Primero, procesar números con extensión
        const conExtension = contacto.match(/(\d+)\s*\(ext\.?\s*\d+\)/gi);
        if (conExtension) {
            conExtension.forEach(match => {
                const partes = match.match(/(\d+)\s*\(ext\.?\s*(\d+)\)/i);
                const numero = partes[1];
                const extension = partes[2];
                
                const telLimpio = numero.replace(/\D/g, '');
                if (telLimpio.length >= 10) {
                    const html = `<a href="tel:${telLimpio}" style="color: #922B21; text-decoration: underline;">${numero}</a> <span style="color: #666; font-size: 0.9em;">(ext. ${extension})</span>`;
                    numerosHTML.push(html);
                    resultado = resultado.replace(match, '|||REEMPLAZADO|||');
                }
            });
        }
        
        // Luego, procesar números sin extensión (los que quedaron)
        const numerosSolos = resultado.match(/\d{10,}/g);
        if (numerosSolos) {
            numerosSolos.forEach(numero => {
                const telLimpio = numero.replace(/\D/g, '');
                if (telLimpio.length >= 10) {
                    numerosHTML.push(`<a href="tel:${telLimpio}" style="color: #922B21; text-decoration: underline;">${numero}</a>`);
                }
            });
        }
        
        if (numerosHTML.length > 0) {
            content += `<p><strong><i class="fas fa-phone"></i> Contacto:</strong><br>${numerosHTML.join('<br>')}</p>`;
        } else {
            content += `<p><strong><i class="fas fa-phone"></i> Contacto:</strong> ${contacto}</p>`;
        }
    }
    
    // Contenedor de botones
    content += `
        <div class="popup-buttons-container">
            <a href="javascript:void(0)" onclick="openPdfModal()" class="popup-link"><i class="fas fa-info-circle"></i> Más información</a>
        </div>
    `;
    
    content += `</div>`;
    return content;
}

// ======================================
// FILTRADO DE MARCADORES
// ======================================
function filterMarkers() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const tipoSelected = document.getElementById('tipoFilter').value;

    markersLayer.clearLayers();

    const filtered = allMarkers.filter(item => {
        const nombre = (item.data['Nombre del punto Dalia'] || '').toLowerCase();
        const tipo = (item.data['Tipo'] || '').trim();
        
        const matchSearch = searchTerm === '' || nombre.includes(searchTerm);
        const matchTipo = tipoSelected === '' || tipo === tipoSelected;
        
        return matchSearch && matchTipo;
    });

    filtered.forEach(item => {
        markersLayer.addLayer(item.marker);
    });
    
    // Actualizar marcadores filtrados para búsqueda
    filteredMarkers = filtered;

    updateInfo(filtered.length);
}

// ======================================
// ACTUALIZACIÓN DE FILTROS
// ======================================
function updateFilters(tipos) {
    const tipoFilter = document.getElementById('tipoFilter');
    
    // Limpiar opciones existentes (excepto la primera)
    tipoFilter.innerHTML = '<option value="">Todos los tipos</option>';
    
    // Agregar opciones de tipos
    Array.from(tipos).sort().forEach(tipo => {
        const option = document.createElement('option');
        option.value = tipo;
        option.textContent = tipo;
        tipoFilter.appendChild(option);
    });
}

// ======================================
// ACTUALIZACIÓN DE INFORMACIÓN
// ======================================
function updateInfo(count) {
    const totalPuntos = document.getElementById('totalPuntos');
    const total = count !== undefined ? count : allMarkers.length;
    totalPuntos.innerHTML = `
        <strong>${total}</strong> punto${total !== 1 ? 's' : ''} Dalia ${count !== undefined ? 'encontrado' + (total !== 1 ? 's' : '') : 'disponible' + (total !== 1 ? 's' : '')}
    `;
}

// ======================================
// GEOLOCALIZACIÓN
// ======================================
function getUserLocation() {
    const locationBtn = document.getElementById('locationBtn');
    
    if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalización');
        return;
    }

    locationBtn.classList.add('loading');
    
    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            console.log(`Ubicación obtenida: ${lat}, ${lng} (±${accuracy}m)`);

            // Remover marcadores anteriores
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
            }
            if (userLocationCircle) {
                map.removeLayer(userLocationCircle);
            }

            // Crear círculo de precisión
            userLocationCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#4285F4',
                fillColor: '#4285F4',
                fillOpacity: 0.15,
                weight: 2
            }).addTo(map);

            // Crear marcador de ubicación
            const locationIcon = L.divIcon({
                html: '<div class="user-location-marker"></div>',
                className: 'user-location-icon',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            userLocationMarker = L.marker([lat, lng], { icon: locationIcon })
                .bindPopup('Tu ubicación actual')
                .addTo(map);

            // Centrar mapa
            map.setView([lat, lng], 15);

            locationBtn.classList.remove('loading');

            // Alertar si la precisión es baja
            if (accuracy > 1000) {
                alert(`⚠️ Precisión baja (±${Math.round(accuracy)}m). Para mejor precisión, activa el GPS y sal al exterior.`);
            }
        },
        (error) => {
            locationBtn.classList.remove('loading');
            
            let message = 'No se pudo obtener tu ubicación. ';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    message += 'Permiso denegado. Por favor, permite el acceso a tu ubicación.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    message += 'Ubicación no disponible.';
                    break;
                case error.TIMEOUT:
                    message += 'Tiempo de espera agotado. Intenta de nuevo.';
                    break;
                default:
                    message += 'Error desconocido.';
            }
            alert(message);
            console.error('Error de geolocalización:', error);
        },
        options
    );
}

// ======================================
// UTILIDADES
// ======================================
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ======================================
// ESTILOS ADICIONALES PARA POPUPS
// ======================================
const popupStyles = document.createElement('style');
popupStyles.textContent = `
    .custom-popup .leaflet-popup-content {
        margin: 15px;
        line-height: 1.6;
    }
    .popup-header-with-number {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
    }
    .punto-dalia-number {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 40px;
        height: 40px;
        background: #922B21;
        color: white;
        border-radius: 50%;
        font-weight: bold;
        font-size: 1.1rem;
        flex-shrink: 0;
        padding: 0 8px;
    }
    .popup-content-custom h3 {
        color: #922B21;
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        flex: 1;
    }
    .popup-content-custom p {
        margin: 8px 0;
        font-size: 0.9rem;
    }
    .popup-content-custom strong {
        color: #333;
    }
    .popup-content-custom i {
        margin-right: 5px;
        color: #922B21;
        width: 16px;
        display: inline-block;
    }
    .popup-buttons-container {
        display: flex;
        gap: 10px;
        margin-top: 12px;
        flex-wrap: wrap;
    }
    .popup-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-width: 120px;
        padding: 10px 15px;
        background: #922B21;
        color: white !important;
        text-decoration: none;
        border-radius: 5px;
        font-size: 0.9rem;
        transition: background 0.3s ease;
        font-weight: 500;
    }
    .popup-link:hover {
        background: #7a1f1a;
        color: white !important;
    }
    .popup-link i {
        color: white !important;
        margin-right: 8px;
    }
    .custom-div-icon {
        background: none;
        border: none;
    }
    .user-location-icon {
        background: none;
        border: none;
    }
`;
document.head.appendChild(popupStyles);

console.log('🗺️ Geoportal Dalia cargado correctamente');

// ======================================
// MODAL PDF CON PDF.JS Y ZOOM CONTROLADO
// ======================================
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let currentZoomLevel = 1.0; // Zoom del PDF (1.0 = 100%, 4.0 = 400%)
const PDF_URL = 'archivos/Modelo.pdf';
const BASE_QUALITY_SCALE = 3.0; // Escala base para calidad
const NORMAL_ZOOM = 1.0; // 100%
const MAX_ZOOM = 4.0; // 400%

// Configurar PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function openPdfModal() {
    const modal = document.getElementById('pdfModal');
    modal.classList.add('active');
    currentZoomLevel = 1.0;
    loadPdf();
    
    // Cerrar con la tecla ESC
    document.addEventListener('keydown', closePdfOnEsc);
}

function closePdfModal() {
    const modal = document.getElementById('pdfModal');
    modal.classList.remove('active');
    
    // Limpiar PDF
    pdfDoc = null;
    currentPage = 1;
    currentZoomLevel = 1.0;
    const canvas = document.getElementById('pdfCanvas');
    if (canvas) {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // Remover listener de ESC
    document.removeEventListener('keydown', closePdfOnEsc);
    
    // Invalidar tamaño del mapa para asegurar que se vea bien
    setTimeout(() => {
        if (window.map) {
            window.map.invalidateSize();
        }
    }, 100);
}

function closePdfOnEsc(e) {
    if (e.key === 'Escape') {
        closePdfModal();
    }
}

async function loadPdf() {
    try {
        const loadingTask = pdfjsLib.getDocument(PDF_URL);
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        
        // Actualizar info de páginas
        updatePageInfo();
        
        // Renderizar primera página
        renderPage(currentPage);
    } catch (error) {
        console.error('Error al cargar PDF:', error);
        alert('Error al cargar el documento PDF');
    }
}

async function renderPage(pageNum) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = document.getElementById('pdfCanvas');
        const context = canvas.getContext('2d');
        
        // Obtener el viewport base
        const viewport = page.getViewport({ scale: 1 });
        
        // Calcular escala para ajustar al ancho del contenedor
        const container = document.querySelector('.pdf-viewer');
        const containerWidth = container.clientWidth - 20;
        const fitScale = containerWidth / viewport.width;
        
        // Aplicar el zoom actual del usuario
        const finalScale = fitScale * currentZoomLevel * BASE_QUALITY_SCALE;
        const renderViewport = page.getViewport({ scale: finalScale });
        
        // Multiplicar por devicePixelRatio para pantallas de alta densidad
        const outputScale = window.devicePixelRatio || 1;
        
        // Configurar canvas a alta resolución
        canvas.width = renderViewport.width * outputScale;
        canvas.height = renderViewport.height * outputScale;
        
        // Establecer el tamaño visual con el zoom aplicado
        const displayWidth = viewport.width * fitScale * currentZoomLevel;
        const displayHeight = viewport.height * fitScale * currentZoomLevel;
        canvas.style.width = displayWidth + 'px';
        canvas.style.height = displayHeight + 'px';
        
        // Ajustar contexto para la escala de salida
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        
        // Renderizar página con alta calidad
        const renderContext = {
            canvasContext: context,
            viewport: renderViewport,
            transform: transform
        };
        
        await page.render(renderContext).promise;
        
        // Actualizar controles
        updatePageInfo();
        updateZoomDisplay();
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage === totalPages;
    } catch (error) {
        console.error('Error al renderizar página:', error);
    }
}

function updatePageInfo() {
    document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;
}

function updateZoomDisplay() {
    const zoomPercent = Math.round(currentZoomLevel * 100);
    document.getElementById('zoomLevel').textContent = `${zoomPercent}%`;
    
    // Actualizar estado de los botones
    const zoomOutBtn = document.getElementById('zoomOut');
    const zoomInBtn = document.getElementById('zoomIn');
    
    if (zoomOutBtn && zoomInBtn) {
        if (currentZoomLevel === NORMAL_ZOOM) {
            // En 100%, solo el botón de acercar está habilitado
            zoomOutBtn.disabled = true;
            zoomInBtn.disabled = false;
        } else {
            // En 400%, solo el botón de alejar está habilitado
            zoomOutBtn.disabled = false;
            zoomInBtn.disabled = true;
        }
    }
}

function zoomIn() {
    // Acercar a 400%
    currentZoomLevel = MAX_ZOOM;
    renderPage(currentPage);
}

function zoomOut() {
    // Volver a 100%
    currentZoomLevel = NORMAL_ZOOM;
    renderPage(currentPage);
}

function resetZoom() {
    // Restablecer a 100%
    currentZoomLevel = NORMAL_ZOOM;
    renderPage(currentPage);
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderPage(currentPage);
    }
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
    }
}

function downloadPdf() {
    const link = document.createElement('a');
    link.href = PDF_URL;
    link.download = 'Modelo_Punto_Dalia.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Event listeners para el modal PDF
document.addEventListener('DOMContentLoaded', function() {
    const closePdfBtn = document.getElementById('closePdfModal');
    if (closePdfBtn) {
        closePdfBtn.addEventListener('click', closePdfModal);
    }
    
    const prevBtn = document.getElementById('prevPage');
    if (prevBtn) {
        prevBtn.addEventListener('click', prevPage);
    }
    
    const nextBtn = document.getElementById('nextPage');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextPage);
    }
    
    const zoomInBtn = document.getElementById('zoomIn');
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', zoomIn);
    }
    
    const zoomOutBtn = document.getElementById('zoomOut');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', zoomOut);
    }
    
    const resetZoomBtn = document.getElementById('resetZoom');
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener('click', resetZoom);
    }
    
    const downloadBtn = document.getElementById('downloadPdf');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadPdf);
    }
    
    // Cerrar modal al hacer click fuera del contenido
    const pdfModal = document.getElementById('pdfModal');
    if (pdfModal) {
        pdfModal.addEventListener('click', function(e) {
            if (e.target === pdfModal) {
                closePdfModal();
            }
        });
    }
});

// ======================================
// ENCONTRAR PUNTO DALIA MÁS CERCANO
// ======================================
function findNearestPuntoDalia() {
    if (!navigator.geolocation) {
        alert('Tu navegador no soporta geolocalización');
        return;
    }
    
    const btn = document.getElementById('nearestBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            console.log('📍 Ubicación del usuario:', userLat, userLng);
            
            // Usar marcadores filtrados si hay filtros activos, sino usar todos
            const marcadoresParaBuscar = filteredMarkers.length > 0 ? filteredMarkers : allMarkers;
            
            if (marcadoresParaBuscar.length === 0) {
                alert('No hay puntos Dalia disponibles con los filtros actuales');
                btn.innerHTML = '<i class="fas fa-search"></i>';
                btn.disabled = false;
                return;
            }
            
            // Si hay ejes viales, calcular ruta caminable
            let distancias;
            if (ejesVialesData && ejesVialesData.features && ejesVialesData.features.length > 0) {
                console.log('🛣️ Calculando rutas con ejes viales...');
                distancias = calcularDistanciasConEjesViales(userLat, userLng, marcadoresParaBuscar);
            } else {
                console.log('⚠️ Calculando distancias en línea recta (sin ejes viales)...');
                // Calcular distancias en línea recta si no hay ejes viales
                distancias = marcadoresParaBuscar.map(item => {
                    const puntoLat = parseFloat(item.data.Latitud);
                    const puntoLng = parseFloat(item.data.Longitud);
                    const distancia = calcularDistancia(userLat, userLng, puntoLat, puntoLng);
                    
                    return {
                        marker: item.marker,
                        data: item.data,
                        distancia: distancia,
                        tiempoMinutos: Math.round((distancia * 1000 / 4000) * 60),
                        lat: puntoLat,
                        lng: puntoLng,
                        metodo: 'línea recta'
                    };
                });
            }
            
            // Ordenar por distancia/tiempo
            distancias.sort((a, b) => a.tiempoMinutos - b.tiempoMinutos);
            
            // Filtrar por estado de operación (abierto/cerrado)
            const ahora = new Date();
            const distanciasConEstado = distancias.map(item => {
                const horario = item.data['Horario de atención'] || '';
                const estaAbierto = verificarHorarioOperacion(horario, ahora);
                return { ...item, estaAbierto };
            });
            
            // Priorizar puntos abiertos
            distanciasConEstado.sort((a, b) => {
                // Primero ordenar por estado (abiertos primero)
                if (a.estaAbierto !== b.estaAbierto) {
                    return b.estaAbierto - a.estaAbierto;
                }
                // Luego por tiempo
                return a.tiempoMinutos - b.tiempoMinutos;
            });
            
            // Obtener el más cercano
            const masCercano = distanciasConEstado[0];
            
            if (masCercano) {
                // Limpiar marcadores previos
                if (userLocationMarker) {
                    map.removeLayer(userLocationMarker);
                }
                if (userLocationCircle) {
                    map.removeLayer(userLocationCircle);
                }
                if (rutaActual) {
                    map.removeLayer(rutaActual);
                    rutaActual = null;
                }
                
                // Marcar ubicación del usuario
                userLocationMarker = L.marker([userLat, userLng], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })
                }).addTo(map);
                userLocationMarker.bindPopup('Tu ubicación');
                
                // Dibujar ruta considerando ejes viales
                const puntosRuta = calcularRutaPorEjesViales(userLat, userLng, masCercano.lat, masCercano.lng);
                
                rutaActual = L.polyline(
                    puntosRuta,
                    {
                        color: '#922B21',
                        weight: 4,
                        opacity: 0.7,
                        dashArray: '10, 10'
                    }
                ).addTo(map);
                
                // Centrar el mapa en el punto Dalia encontrado con zoom apropiado
                setTimeout(() => {
                    // Primero centrar en el punto Dalia
                    map.setView([masCercano.lat, masCercano.lng], 17);
                    
                    // Luego abrir el popup
                    setTimeout(() => {
                        masCercano.marker.openPopup();
                    }, 300);
                }, 100);
            }
            
            btn.innerHTML = '<i class="fas fa-search"></i>';
            btn.disabled = false;
        },
        (error) => {
            console.error('Error al obtener ubicación:', error);
            alert('No se pudo obtener tu ubicación. Por favor, activa los permisos de ubicación.');
            btn.innerHTML = '<i class="fas fa-search"></i>';
            btn.disabled = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// ======================================
// CALCULAR DISTANCIA ENTRE DOS PUNTOS (Haversine)
// ======================================
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}


// ======================================
// CALCULAR DISTANCIAS CON EJES VIALES
// ======================================
function calcularDistanciasConEjesViales(userLat, userLng, markers) {
    // 1. Encontrar el eje vial más cercano a la ubicación del usuario
    const userEjeVial = encontrarEjeVialMasCercano(userLat, userLng);
    
    if (!userEjeVial) {
        console.warn('⚠️ Usuario muy lejos de ejes viales, usando distancia directa');
        // Fallback a distancia directa
        return markers.map(item => {
            const puntoLat = parseFloat(item.data.Latitud);
            const puntoLng = parseFloat(item.data.Longitud);
            const distancia = calcularDistancia(userLat, userLng, puntoLat, puntoLng);
            
            return {
                marker: item.marker,
                data: item.data,
                distancia: distancia,
                tiempoMinutos: Math.round((distancia * 1000 / 4000) * 60),
                lat: puntoLat,
                lng: puntoLng,
                metodo: 'línea recta'
            };
        });
    }
    
    console.log('✅ Usuario conectado a eje vial:', userEjeVial.distanciaAlEje.toFixed(0), 'metros');
    
    // 2. Para cada punto Dalia, calcular ruta aproximada
    return markers.map(item => {
        const puntoLat = parseFloat(item.data.Latitud);
        const puntoLng = parseFloat(item.data.Longitud);
        
        // Encontrar eje vial más cercano al punto
        const puntoEjeVial = encontrarEjeVialMasCercano(puntoLat, puntoLng);
        
        // Distancia en línea recta
        const distanciaDirecta = calcularDistancia(userLat, userLng, puntoLat, puntoLng);
        
        let tiempoMinutos, distanciaTotal, metodo;
        
        if (puntoEjeVial && puntoEjeVial.distanciaAlEje < 0.3) {
            // El punto está cerca de un eje vial (menos de 300 metros)
            // Calcular tiempo considerando ejes viales
            
            // Distancia desde usuario hasta su eje vial
            const distUserAEje = userEjeVial.distanciaAlEje / 1000;
            
            // Distancia desde el eje del punto hasta el punto
            const distEjeAPunto = puntoEjeVial.distanciaAlEje / 1000;
            
            // Distancia entre los dos ejes (aproximada)
            const distanciaEntreEjes = calcularDistancia(
                userEjeVial.punto.lat, 
                userEjeVial.punto.lng,
                puntoEjeVial.punto.lat,
                puntoEjeVial.punto.lng
            );
            
            // Distancia total ajustada (factor 1.3 para considerar que no es línea recta)
            distanciaTotal = (distUserAEje + distanciaEntreEjes * 1.3 + distEjeAPunto);
            
            // Tiempo basado en velocidad de caminata + tiempo extra de ejes viales
            const tiempoCaminata = (distanciaTotal * 1000 / 4000) * 60; // 4 km/h
            const tiempoEjesExtra = (userEjeVial.eje.properties.MINUTES || 0) * 0.5; // 50% del tiempo del eje
            
            tiempoMinutos = Math.round(tiempoCaminata + tiempoEjesExtra);
            metodo = 'ejes viales';
        } else {
            // Punto muy lejos de ejes viales, usar distancia directa
            distanciaTotal = distanciaDirecta;
            tiempoMinutos = Math.round((distanciaDirecta * 1000 / 4000) * 60);
            metodo = 'línea recta';
        }
        
        return {
            marker: item.marker,
            data: item.data,
            distancia: distanciaTotal,
            tiempoMinutos: tiempoMinutos,
            lat: puntoLat,
            lng: puntoLng,
            metodo: metodo
        };
    });
}

// ======================================
// ENCONTRAR EJE VIAL MÁS CERCANO
// ======================================
function encontrarEjeVialMasCercano(lat, lng) {
    if (!ejesVialesData || !ejesVialesData.features) {
        return null;
    }
    
    let ejeVialMasCercano = null;
    let distanciaMinima = Infinity;
    let puntoMasCercano = null;
    
    // Buscar solo en un radio de 500 metros (0.5 km)
    const RADIO_BUSQUEDA = 0.5;
    
    ejesVialesData.features.forEach(feature => {
        if (feature.geometry.type === 'MultiLineString') {
            feature.geometry.coordinates.forEach(lineString => {
                // Para cada segmento del eje vial
                for (let i = 0; i < lineString.length - 1; i++) {
                    const p1 = { lng: lineString[i][0], lat: lineString[i][1] };
                    const p2 = { lng: lineString[i + 1][0], lat: lineString[i + 1][1] };
                    
                    // Distancia rápida al primer punto del segmento
                    const distP1 = calcularDistancia(lat, lng, p1.lat, p1.lng);
                    
                    // Solo procesar si está dentro del radio de búsqueda
                    if (distP1 < RADIO_BUSQUEDA) {
                        // Calcular punto más cercano en el segmento
                        const puntoEnSegmento = puntoMasCercanoEnSegmento(
                            { lat, lng },
                            p1,
                            p2
                        );
                        
                        const distancia = calcularDistancia(
                            lat, 
                            lng, 
                            puntoEnSegmento.lat, 
                            puntoEnSegmento.lng
                        );
                        
                        if (distancia < distanciaMinima) {
                            distanciaMinima = distancia;
                            ejeVialMasCercano = feature;
                            puntoMasCercano = puntoEnSegmento;
                        }
                    }
                }
            });
        }
    });
    
    if (ejeVialMasCercano) {
        return {
            eje: ejeVialMasCercano,
            punto: puntoMasCercano,
            distanciaAlEje: distanciaMinima * 1000 // en metros
        };
    }
    
    return null;
}

// ======================================
// PUNTO MÁS CERCANO EN UN SEGMENTO
// ======================================
function puntoMasCercanoEnSegmento(punto, p1, p2) {
    const A = punto.lng - p1.lng;
    const B = punto.lat - p1.lat;
    const C = p2.lng - p1.lng;
    const D = p2.lat - p1.lat;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
        xx = p1.lng;
        yy = p1.lat;
    } else if (param > 1) {
        xx = p2.lng;
        yy = p2.lat;
    } else {
        xx = p1.lng + param * C;
        yy = p1.lat + param * D;
    }
    
    return { lat: yy, lng: xx };
}

// ======================================
// CALCULAR RUTA POR EJES VIALES
// ======================================
function calcularRutaPorEjesViales(origenLat, origenLng, destinoLat, destinoLng) {
    // Si no hay ejes viales, retornar línea recta simple
    if (!ejesVialesData || !ejesVialesData.features || ejesVialesData.features.length === 0) {
        return [[origenLat, origenLng], [destinoLat, destinoLng]];
    }
    
    // Encontrar ejes viales cercanos al origen y destino
    const ejeOrigen = encontrarEjeVialMasCercano(origenLat, origenLng);
    const ejeDestino = encontrarEjeVialMasCercano(destinoLat, destinoLng);
    
    // Si no se encuentran ejes cercanos, usar línea recta
    if (!ejeOrigen || !ejeDestino || ejeOrigen.distanciaAlEje > 500 || ejeDestino.distanciaAlEje > 500) {
        return [[origenLat, origenLng], [destinoLat, destinoLng]];
    }
    
    // Construir ruta simplificada (sin puntos intermedios complejos)
    const puntosRuta = [];
    
    // 1. Desde origen hasta eje vial más cercano
    puntosRuta.push([origenLat, origenLng]);
    
    // Si el origen está muy cerca del eje (menos de 50 metros), no mostrar el segmento
    if (ejeOrigen.distanciaAlEje > 50) {
        puntosRuta.push([ejeOrigen.punto.lat, ejeOrigen.punto.lng]);
    }
    
    // 2. Línea directa al eje del destino (representando el recorrido por calles)
    if (ejeDestino.distanciaAlEje > 50) {
        puntosRuta.push([ejeDestino.punto.lat, ejeDestino.punto.lng]);
    }
    
    // 3. Finalmente al destino
    puntosRuta.push([destinoLat, destinoLng]);
    
    return puntosRuta;
}

// ======================================
// VERIFICAR HORARIO DE OPERACIÓN
// ======================================
function verificarHorarioOperacion(horarioTexto, fechaHora) {
    if (!horarioTexto || horarioTexto.trim() === '') {
        return true; // Si no hay horario, asumir abierto
    }
    
    const texto = horarioTexto.toUpperCase().trim();
    
    // Verificar 24/7 o similares
    if (texto.includes('24/7') || 
        texto.includes('24 HORAS') || 
        texto.includes('24HRS') ||
        texto.includes('24 HRS') ||
        (texto.includes('24') && texto.includes('365'))) {
        return true;
    }
    
    // Obtener día y hora actual
    const diasSemana = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'SABADO'];
    const diaActual = diasSemana[fechaHora.getDay()];
    const horaActual = fechaHora.getHours();
    const minutoActual = fechaHora.getMinutes();
    const tiempoActualMinutos = horaActual * 60 + minutoActual;
    
    // Extraer todos los rangos de horarios
    const regexHorario = /(\d{1,2}):?(\d{2})?\s*(?:A|A\s+LAS?|AL?|-|–)\s*(\d{1,2}):?(\d{2})?/gi;
    const horariosEncontrados = [...texto.matchAll(regexHorario)];
    
    if (horariosEncontrados.length === 0) {
        return true; // No hay horarios específicos, asumir abierto
    }
    
    // Verificar si el texto menciona algún día específico
    const mencionaDias = texto.includes('LUNES') || texto.includes('MARTES') || 
                         texto.includes('MIÉRCOLES') || texto.includes('MIERCOLES') ||
                         texto.includes('JUEVES') || texto.includes('VIERNES') ||
                         texto.includes('SÁBADO') || texto.includes('SABADO') || 
                         texto.includes('DOMINGO') || texto.includes('L-V');
    
    // Si hay horarios pero NO menciona días, aplicar a todos los días
    if (!mencionaDias) {
        return verificarSiHoraEnRangos(horariosEncontrados, tiempoActualMinutos);
    }
    
    // Dividir el texto en bloques por días
    // Buscar patrones como "LUNES A VIERNES 10:00-17:00 SABADOS: 10:00-14:00"
    const esLunesAViernes = diaActual !== 'DOMINGO' && diaActual !== 'SÁBADO' && diaActual !== 'SABADO';
    const esSabado = diaActual === 'SÁBADO' || diaActual === 'SABADO';
    const esDomingo = diaActual === 'DOMINGO';
    
    // Dividir por bloques de días (buscar separadores comunes)
    const bloques = texto.split(/(?=LUNES)|(?=MARTES)|(?=MIÉRCOLES)|(?=MIERCOLES)|(?=JUEVES)|(?=VIERNES)|(?=SÁBADO)|(?=SABADO)|(?=DOMINGO)/);
    
    for (const bloque of bloques) {
        if (!bloque.trim()) continue;
        
        const bloqueUpper = bloque.toUpperCase();
        let aplicaHoy = false;
        
        // Verificar si este bloque aplica para hoy
        if (bloqueUpper.includes('LUNES A VIERNES') || bloqueUpper.includes('LUNES-VIERNES') || bloqueUpper.includes('L-V')) {
            aplicaHoy = esLunesAViernes;
        } else if ((bloqueUpper.includes('SÁBADO') || bloqueUpper.includes('SABADO')) && !bloqueUpper.includes('VIERNES')) {
            aplicaHoy = esSabado;
        } else if (bloqueUpper.includes('DOMINGO') && !bloqueUpper.includes('SÁBADO') && !bloqueUpper.includes('SABADO')) {
            aplicaHoy = esDomingo;
        } else if (bloqueUpper.includes(diaActual)) {
            aplicaHoy = true;
        }
        
        if (aplicaHoy) {
            // Buscar horarios en este bloque específico
            const horariosBloque = [...bloque.matchAll(regexHorario)];
            if (horariosBloque.length > 0) {
                if (verificarSiHoraEnRangos(horariosBloque, tiempoActualMinutos)) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// ======================================
// VERIFICAR SI HORA ESTÁ EN RANGOS
// ======================================
function verificarSiHoraEnRangos(matches, tiempoActualMinutos) {
    for (const match of matches) {
        let horaInicio = parseInt(match[1]);
        const minInicio = parseInt(match[2] || '0');
        let horaFin = parseInt(match[3]);
        const minFin = parseInt(match[4] || '0');
        
        // Convertir a minutos desde medianoche
        const inicioMinutos = horaInicio * 60 + minInicio;
        let finMinutos = horaFin * 60 + minFin;
        
        // Si termina a medianoche o después (ej: hasta las 24:00 o 00:00)
        if (finMinutos === 0 || finMinutos === 1440) {
            finMinutos = 1439; // 23:59
        }
        
        // Verificar si la hora actual está en el rango
        if (tiempoActualMinutos >= inicioMinutos && tiempoActualMinutos <= finMinutos) {
            return true;
        }
    }
    
    return false;
}