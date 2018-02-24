// **** WebSocket ****

const protocol = document.domain === 'localhost' ? "http://" : "https://";
const socket = io.connect(protocol + document.domain + ":" + location.port + "/planarally");
let board_initialised = false;
const IS_DM = findGetParameter("dm") !== null;
socket.on("connect", function () {
    console.log("Connected");
    socket.emit("join room", findGetParameter("room"), IS_DM);
});
socket.on("disconnect", function () {
    console.log("Disconnected");
});
socket.on("token list", function (tokens) {
    const m = $("#menu-tokens");
    m.empty();
    let h = '';
    const process = function(entry, path) {
        path = path || "";
        const folders = new Map(Object.entries(entry.folders));
        folders.forEach(function(value, key){
            h += "<button class='accordion'>" + key + "</button><div class='accordion-panel'><div class='accordion-subpanel'>";
            process(value, path + key + "/");
            h += "</div></div>";
        });
        entry.files.forEach(function(token){
            h += "<div class='draggable token'><img src='/static/img/" + path + token + "' width='35'>" + token + "</div>";
        });
    };
    process(tokens);
    m.html(h);
    $(".draggable").draggable({
        helper: "clone",
        appendTo: "#board"
    });
    $('.accordion').each(function(idx) {
        $(this).on("click", function(){
            $(this).toggleClass("accordion-active");
            $(this).next().toggle();
        });
    });
});
socket.on("board init", function (board) {
    gameManager = new GameManager();
    const layersdiv = $('#layers');
    layersdiv.empty();
    const layerselectdiv = $('#layerselect');
    layerselectdiv.find("ul").empty();
    let selectable_layers = 0;
    for (let i = 0; i < board.layers.length; i++) {
        const new_layer = board.layers[i];
        // UI changes
        layersdiv.append("<canvas id='" + new_layer.name + "-layer' style='z-index: " + i + "'></canvas>");
        if (new_layer.selectable) {
            let extra = '';
            if (selectable_layers === 0) extra = " class='layer-selected'";
            layerselectdiv.find('ul').append("<li id='select-" + new_layer.name + "'" + extra + "><a href='#'>" + new_layer.name + "</a></li>");
            selectable_layers += 1;
        }
        const canvas = $('#' + new_layer.name + '-layer')[0];
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // State changes
        let l = new LayerState(canvas, new_layer.name);
        l.selectable = new_layer.selectable;
        l.player_editable = new_layer.player_editable;
        gameManager.layerManager.addLayer(l);
        if (new_layer.grid) {
            gameManager.layerManager.setGridSize(new_layer.size);
            gameManager.layerManager.drawGrid();
        } else {
            l.setShapes(new_layer.shapes);
        }
    }
    socket.emit("client initialised");
    board_initialised = true;

    if (selectable_layers > 1){
        layerselectdiv.find("li").on("click", function () {
            const name = this.id.split("-")[1];
            const old = layerselectdiv.find("#select-" + gameManager.layerManager.selectedLayer);
            if (name !== gameManager.layerManager.selectedLayer) {
                $(this).addClass("layer-selected");
                old.removeClass("layer-selected");
                gameManager.layerManager.setLayer(name);
            }
        });
    } else {
        layerselectdiv.hide();
    }

});
socket.on("layer set", function (layer) {
    gameManager.layerManager.getLayer(layer.name).setShapes(layer.shapes);
});
socket.on("set gridsize", function (gridSize) {
    gameManager.layerManager.setGridSize(gridSize);
});


// **** BOARD ELEMENTS ****

function Shape(x, y, w, h, fill) {
    this.x = x || 0;
    this.y = y || 0;
    this.w = w || 1;
    this.h = h || 1;
    this.fill = fill || '#000';
}
Shape.prototype.asDict = function() {
    return {x: this.x, y: this.y, w: this.w, h: this.h, c: this.fill, type: "shape"};
};
Shape.prototype.draw = function (ctx) {
    ctx.fillStyle = this.fill;
    const z = gameManager.layerManager.zoomFactor;
    ctx.fillRect(this.x * z, this.y * z, this.w * z, this.h * z);
};
Shape.prototype.contains = function (mx, my) {
    const z = gameManager.layerManager.zoomFactor;
    return (this.x * z <= mx) && ((this.x + this.w) * z >= mx) &&
        (this.y * z <= my) && ((this.y + this.h) * z >= my);
};
Shape.prototype.inCorner = function (mx, my, corner) {
    const z = gameManager.layerManager.zoomFactor;
    switch (corner) {
        case 'ne':
            return (this.x + this.w - 3) * z <= mx && mx <= (this.x + this.w + 3) * z && (this.y - 3) * z <= my && my <= (this.y + 3) * z;
        case 'nw':
            return (this.x - 3) * z <= mx && mx <= (this.x + 3) * z && (this.y - 3) * z <= my && my <= (this.y + 3) * z;
        case 'sw':
            return (this.x - 3) * z <= mx && mx <= (this.x + 3) * z && (this.y + this.h - 3) * z <= my && my <= (this.y + this.h + 3) * z;
        case 'se':
            return (this.x + this.w - 3) * z <= mx && mx <= (this.x + this.w + 3) * z && (this.y + this.h - 3) * z <= my && my <= (this.y + this.h + 3) * z;
        default:
            return false;
    }
};
Shape.prototype.getCorner = function (mx, my) {
    if (this.inCorner(mx, my, "ne"))
        return "ne";
    else if (this.inCorner(mx, my, "nw"))
        return "nw";
    else if (this.inCorner(mx, my, "se"))
        return "se";
    else if (this.inCorner(mx, my, "sw"))
        return "sw";
};
Shape.prototype.showContextMenu = function (mouse) {
    const l = gameManager.layerManager.getLayer();
    l.selection = this;
    l.invalidate(false);
    const token = this;
    $menu.show();
    $menu.empty();
    $menu.css({left: mouse.x, top: mouse.y});
    let data = "" +
        "<ul>" +
        "<li>Layer<ul>";
    gameManager.layerManager.layers.forEach(function(layer) {
        if (!layer.selectable) return;
       const sel = layer.name === l.name ? " style='background-color:aqua' " : " ";
       data  += "<li data-action='setLayer' data-layer='" + layer.name + "'" + sel + "class='context-clickable'>" + layer.name + "</li>";
    });
    data += "</ul></li>" +
        "<li data-action='moveToBack' class='context-clickable'>Move to back</li>" +
        "<li data-action='moveToFront' class='context-clickable'>Move to front</li>" +
        "</ul>";
    $menu.html(data);
    $(".context-clickable").on('click', function () {
        handleContextMenu($(this), token);
    });
};

function Line(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
}
Line.prototype = Object.create(Shape.prototype);
Line.prototype.draw = function (ctx) {
    ctx.beginPath();
    ctx.moveTo(this.x1, this.y1);
    ctx.lineTo(this.x2, this.y2);
    ctx.strokeStyle = 'rgba(255,0,0, 0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
};
Line.prototype.asDict = function() {
    return {x1: this.x1, x2: this.x2, y1: this.y1, y2: this.y2, type: "line"};
};

function Text(x, y, text, font, angle) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.font = font;
    this.angle = angle || 0;
}
Text.prototype = Object.create(Shape.prototype);
Text.prototype.draw = function (ctx) {
    ctx.font = this.font;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.textAlign = "center";
    ctx.fillText(this.text, 0, -5);
    ctx.restore();
};
Text.prototype.asDict = function() {
    return {x: this.x, y: this.y, text: this.text, font: this.font, angle: this.angle, type: "text"};
};

function Token(img, x, y, w, h, uuid) {
    this.uuid = uuid || uuidv4();
    this.img = img;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
}
Token.prototype = Object.create(Shape.prototype);
Token.prototype.asDict = function() {
    return {x: this.x, y: this.y, w: this.w, h: this.h, img: this.img.src, uuid: this.uuid, type: 'token'};
};
Token.prototype.draw = function (ctx) {
    const z = gameManager.layerManager.zoomFactor;
    ctx.drawImage(this.img, this.x * z, this.y * z, this.w * z, this.h * z);
};

// **** specific Layer State Management

function LayerState(canvas, name) {
    this.canvas = canvas;
    this.name = name;
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext('2d');

    if (document.defaultView && document.defaultView.getComputedStyle) {
        this.stylePaddingLeft = parseInt(document.defaultView.getComputedStyle(canvas, null)['paddingLeft'], 10) || 0;
        this.stylePaddingTop = parseInt(document.defaultView.getComputedStyle(canvas, null)['paddingTop'], 10) || 0;
        this.styleBorderLeft = parseInt(document.defaultView.getComputedStyle(canvas, null)['borderLeftWidth'], 10) || 0;
        this.styleBorderTop = parseInt(document.defaultView.getComputedStyle(canvas, null)['borderTopWidth'], 10) || 0;
    }

    const html = document.body.parentNode;
    this.htmlTop = html.offsetTop;
    this.htmlLeft = html.offsetLeft;

    const state = this;

    this.valid = false;
    this.shapes = [];
    this.dragging = false;
    this.resizing = false;
    this.resizedir = '';

    this.selection = null;
    this.dragoffx = 0;
    this.dragoffy = 0;

    this.selectionColor = '#CC0000';
    this.selectionWidth = 2;
    this.interval = 30;
    setInterval(function () {
        state.draw();
    }, state.interval);
}

LayerState.prototype.invalidate = function (sync) {
    if (sync === undefined) sync = false;
    this.valid = false;
    if (sync && board_initialised) {
        socket.emit("layer invalidate", {layer: this.name, shapes: this.getShapesAsDict()});
    }
};
LayerState.prototype.getShapesAsDict = function () {
    const s = [];
    this.shapes.forEach(function (e) {
        s.push(e.asDict());
    });
    return s;
};
LayerState.prototype.addShape = function (shape) {
    this.shapes.push(shape);
    this.invalidate(true);
};
LayerState.prototype.setShapes = function (shapes) {
    const t = [];
    const self = this;
    let keepSelection = false;
    shapes.forEach(function (shape) {
        let sh;
        if (shape.type === 'shape') sh = new Shape(shape.x, shape.y, shape.w, shape.h, shape.c);
        if (shape.type === 'line') sh = new Line(shape.x1, shape.y1, shape.x2, shape.y2);
        if (shape.type === 'text') sh = new Text(shape.x, shape.y, shape.text, shape.font, shape.angle);
        if (shape.type === 'token') {
            if (gameManager.layerManager.imageMap.has(shape.uuid))
                sh = new Token(gameManager.layerManager.imageMap.get(shape.uuid), shape.x, shape.y, shape.w, shape.h, shape.uuid);
            else {
                const img = new Image(shape.w, shape.h);
                img.src = shape.img;
                sh = new Token(img, shape.x, shape.y, shape.w, shape.h);
                gameManager.layerManager.imageMap.set(sh.uuid, img);
                img.onload = function() {
                    self.invalidate(false);
                };
            }
        }
        t.push(sh);
        if (self.selection && sh.x === self.selection.x && sh.y === self.selection.y && sh.w === self.selection.w && sh.h === self.selection.h) keepSelection = true;
    });
    this.shapes = t;
    if (!keepSelection) this.selection = null;
    this.invalidate(false);
};
LayerState.prototype.removeShape = function (shape) {
    this.shapes.splice(this.shapes.indexOf(shape), 1);
    if (this.selection === shape)   this.selection = null;
    this.invalidate(true);
};
LayerState.prototype.clear = function () {
    this.ctx.clearRect(0, 0, this.width, this.height);
};
LayerState.prototype.draw = function () {
    if (!this.valid) {
        const ctx = this.ctx;
        const shapes = this.shapes;
        this.clear();

        const l = shapes.length;
        for (let i = 0; i < l; i++) {
            const shape = shapes[i];
            if (shape.x > this.width || shape.y > this.height ||
                shape.x + shape.w < 0 || shape.y + shape.h < 0) continue;
            shapes[i].draw(ctx);
        }

        if (this.selection != null) {
            const z = gameManager.layerManager.zoomFactor;
            ctx.strokeStyle = this.selectionColor;
            ctx.lineWidth = this.selectionWidth;
            const mySel = this.selection;
            ctx.strokeRect(mySel.x * z, mySel.y * z, mySel.w* z, mySel.h* z);

            // topright
            ctx.fillRect((mySel.x + mySel.w - 3) * z, (mySel.y - 3) * z, 6 * z, 6 * z);
            // topleft
            ctx.fillRect((mySel.x - 3) * z, (mySel.y - 3) * z, 6 * z, 6 * z);
            // botright
            ctx.fillRect((mySel.x + mySel.w - 3) * z, (mySel.y + mySel.h - 3) * z, 6 * z, 6 * z);
            // botleft
            ctx.fillRect((mySel.x - 3) * z, (mySel.y + mySel.h - 3) * z, 6 * z, 6 * z)
        }

        this.valid = true;
    }
};
LayerState.prototype.getMouse = function (e) {
    let element = this.canvas, offsetX = 0, offsetY = 0, mx, my;

    // Compute the total offset
    if (element.offsetParent !== undefined) {
        do {
            offsetX += element.offsetLeft;
            offsetY += element.offsetTop;
        } while ((element = element.offsetParent));
    }

    // Add padding and border style widths to offset
    // Also add the <html> offsets in case there's a position:fixed bar
    offsetX += this.stylePaddingLeft + this.styleBorderLeft + this.htmlLeft;
    offsetY += this.stylePaddingTop + this.styleBorderTop + this.htmlTop;

    const z = gameManager.layerManager.zoomFactor;

    mx = e.pageX  - offsetX;
    my = e.pageY - offsetY;

    return {x: mx, y: my};
};
LayerState.prototype.moveShapeOrder = function (shape, destinationIndex) {
    const ls = this.shapes;
    const idx = ls.indexOf(shape);
    if (destinationIndex !== idx) {
        ls.splice(idx, 1);
        ls.splice(destinationIndex, 0, shape);
        this.invalidate(true);
    }
};

// **** Manager for working with multiple layers

function LayerManager() {
    this.layers = [];
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.selectedLayer = null;

    this.imageMap = new Map();

    this.gridSize = 50;
    this.unitSize = 5;
    this.zoomFactor = 1;
}
LayerManager.prototype.setWidth = function (width) {
    this.width = width;
    for (let i = 0; i < gameManager.layerManager.layers.length; i++) {
        gameManager.layerManager.layers[i].canvas.width = width;
        gameManager.layerManager.layers[i].width = width;
    }
};
LayerManager.prototype.setHeight = function (height) {
    this.height = height;
    for (let i = 0; i < this.layers.length; i++) {
        this.layers[i].canvas.height = height;
        this.layers[i].height = height;
    }
};
LayerManager.prototype.addLayer = function (layer) {
    this.layers.push(layer);
    if (this.selectedLayer === null && layer.selectable) this.selectedLayer = layer.name;
};
LayerManager.prototype.getLayer = function (name) {
    name = (typeof name === 'undefined') ? this.selectedLayer : name;
    for (let i=0; i<this.layers.length; i++) {
        if (this.layers[i].name === name) return this.layers[i];
    }
};
LayerManager.prototype.setLayer = function (name) {
    let found = false;
    const lm = this;
    this.layers.forEach(function(layer) {
        if (!layer.selectable) return;
        if (found) layer.ctx.globalAlpha = 0.3;
        else layer.ctx.globalAlpha = 1.0;

        if (name === layer.name) {
            lm.selectedLayer = name;
            found = true;
        }

        layer.selection = null;
        layer.invalidate(false);
    });
};
LayerManager.prototype.getGridLayer = function () {
    return this.getLayer("grid");
};
LayerManager.prototype.drawGrid = function () {
    const layer = this.getGridLayer();
    const ctx = layer.ctx;
    const z = gameManager.layerManager.zoomFactor;
    layer.clear();
    ctx.beginPath();

    for (let i = 0; i < layer.width; i += this.gridSize * z) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, layer.height);
        ctx.moveTo(0, i);
        ctx.lineTo(layer.width, i);
    }
    ctx.strokeStyle = 'rgba(255,0,0, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    layer.valid = true;
};
LayerManager.prototype.setGridSize = function (gridSize) {
    if (gridSize !== this.gridSize){
        this.gridSize = gridSize;
        this.drawGrid();
        $('#gridSizeInput').val(gridSize);
    }
};
LayerManager.prototype.invalidate = function (sync) {
    if (sync === undefined) sync = false;
    for (let i = 0; i < this.layers.length - 2; i++) {
        this.layers[i].invalidate(sync);
    }
};
LayerManager.prototype.onMouseDown = function (e) {
    const layer = gameManager.layerManager.getLayer();
    const mouse = layer.getMouse(e);
    const mx = mouse.x;
    const my = mouse.y;

    if (mx < 200 && $('#menu').is(":visible")) {
        return;
    }

    const shapes = layer.shapes;
    const l = shapes.length;
    for (let i = l - 1; i >= 0; i--) {
        const corn = shapes[i].getCorner(mx, my);
        if (corn !== undefined) {
            layer.selection = shapes[i];
            layer.resizing = true;
            layer.resizedir = corn;
            layer.invalidate(false);
            return;
        } else if (shapes[i].contains(mx, my)) {
            const sel = shapes[i];
            layer.selection = sel;
            layer.dragging = true;
            layer.dragoffx = mx - sel.x;
            layer.dragoffy = my - sel.y;
            layer.invalidate(false);
            return;
        }
    }
    if (layer.selection) {
        layer.selection = null;
        layer.invalidate(false);
    }
};
LayerManager.prototype.onMouseMove = function(e) {
    const layer = gameManager.layerManager.getLayer();
    const sel = layer.selection;
    const mouse = layer.getMouse(e);
    if (layer.dragging) {
        sel.x = mouse.x - layer.dragoffx;
        sel.y = mouse.y - layer.dragoffy;
        layer.invalidate(true);
    } else if (layer.resizing) {
        const z = gameManager.layerManager.zoomFactor;
        if (layer.resizedir === 'nw') {
            sel.w = sel.x * z + sel.w * z - mouse.x;
            sel.h = sel.y * z + sel.h * z - mouse.y;
            sel.x = mouse.x / z;
            sel.y = mouse.y / z;
        } else if (layer.resizedir === 'ne') {
            sel.w = mouse.x - sel.x * z;
            sel.h = sel.y * z + sel.h * z - mouse.y;
            sel.y = mouse.y / z;
        } else if (layer.resizedir === 'se') {
            sel.w = mouse.x - sel.x * z;
            sel.h = mouse.y - sel.y * z;
        } else if (layer.resizedir === 'sw') {
            sel.w = sel.x * z + sel.w * z - mouse.x;
            sel.h = mouse.y - sel.y * z;
            sel.x = mouse.x / z;
        }
        sel.w /= z;
        sel.h /= z;
        layer.invalidate(true);
    } else if (sel) {
        if (sel.inCorner(mouse.x, mouse.y, "nw")) {
            document.body.style.cursor = "nw-resize";
        } else if (sel.inCorner(mouse.x, mouse.y, "ne")) {
            document.body.style.cursor = "ne-resize";
        } else if (sel.inCorner(mouse.x, mouse.y, "se")) {
            document.body.style.cursor = "se-resize";
        } else if (sel.inCorner(mouse.x, mouse.y, "sw")) {
            document.body.style.cursor = "sw-resize";
        } else {
            document.body.style.cursor = "default";
        }
    } else {
        document.body.style.cursor = "default";
    }
};
LayerManager.prototype.onMouseUp = function (e) {
    const layer = gameManager.layerManager.getLayer();
    if (!e.altKey && layer.dragging) {
        const gs = gameManager.layerManager.gridSize;
        const mouse = {x: layer.selection.x + layer.selection.w / 2, y: layer.selection.y + layer.selection.h/2};
        const mx = mouse.x;
        const my = mouse.y;
        if ((layer.selection.w / gs) % 2 === 0) {
            layer.selection.x = Math.round(mx / gs) * gs - layer.selection.w/2;
        } else {
            layer.selection.x = (Math.round((mx + (gs/2)) / gs) - (1/2)) * gs - layer.selection.w/2;
        }
        if ((layer.selection.h / gs) % 2 === 0) {
            layer.selection.y = Math.round(my / gs) * gs - layer.selection.h/2;
        } else {
            layer.selection.y = (Math.round((my + (gs/2)) / gs) - (1/2)) * gs - layer.selection.h/2;
        }
        layer.invalidate(true);
    }
    if (layer.resizing) {
        const sel = layer.selection;
        if (sel.w < 0) {
            sel.x += sel.w;
            sel.w = Math.abs(sel.w);
        }
        if (sel.h < 0) {
            sel.y += sel.h;
            sel.h = Math.abs(sel.h);
        }
        if (!e.altKey) {
            const gs = gameManager.layerManager.gridSize;
            sel.x = Math.round(sel.x / gs) * gs;
            sel.y = Math.round(sel.y / gs) * gs;
            sel.w = Math.max(Math.round(sel.w / gs) * gs, gs);
            sel.h = Math.max(Math.round(sel.h / gs) * gs, gs);
        }
        layer.invalidate(true);
    }
    layer.dragging = false;
    layer.resizing = false;
};
LayerManager.prototype.onContextMenu = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const layer = gameManager.layerManager.getLayer();
    const mouse = layer.getMouse(e);
    const mx = mouse.x;
    const my = mouse.y;
    const shapes = layer.shapes;
    const l = shapes.length;
    for (let i = l - 1; i >= 0; i--) {
        if (shapes[i].contains(mx, my)) {
            shapes[i].showContextMenu(mouse);
            break;
        }
    }
};

function RulerTool() {
    this.startPoint = null;
}
RulerTool.prototype.onMouseDown = function (e) {
    // Currently draw on active layer
    const layer = gameManager.layerManager.getLayer("draw");
    this.startPoint = layer.getMouse(e);
    this.ruler = null;
    this.text = null;
};
RulerTool.prototype.onMouseMove = function (e) {
    if (this.startPoint === null) return;
    // Currently draw on active layer
    const layer = gameManager.layerManager.getLayer("draw");
    const endPoint = layer.getMouse(e);
    const ruler = new Line(this.startPoint.x, this.startPoint.y, endPoint.x, endPoint.y);
    const xdiff = endPoint.x - this.startPoint.x;
    const ydiff = endPoint.y - this.startPoint.y;
    const label = Math.round(Math.sqrt(xdiff ** 2 + ydiff ** 2) * gameManager.layerManager.unitSize / gameManager.layerManager.gridSize) + " ft";
    let angle = Math.atan2(ydiff, xdiff);
    const xmid = this.startPoint.x + xdiff / 2;
    const ymid = this.startPoint.y + ydiff / 2;
    const text = new Text(xmid, ymid, label, "20px serif", angle);
    if (this.ruler === null) {
        layer.addShape(ruler);
        layer.addShape(text);
    } else {
        layer.shapes.splice(layer.shapes.indexOf(this.ruler), 1, ruler);
        layer.shapes.splice(layer.shapes.indexOf(this.text), 1, text);
    }
    this.ruler = ruler;
    this.text = text;
    layer.invalidate(true);
};
RulerTool.prototype.onMouseUp = function (e) {
    if (this.startPoint === null) return;
    this.startPoint = null;
    const layer = gameManager.layerManager.getLayer("draw");
    layer.shapes.splice(layer.shapes.indexOf(this.ruler), 1);
    layer.shapes.splice(layer.shapes.indexOf(this.text), 1);
    this.ruler = null;
    this.text = null;
    layer.invalidate(true);
};

function GameManager() {
    this.layerManager = new LayerManager();
    this.selectedTool = 0;
    this.rulerTool = new RulerTool();

    const gm = this;

    // prevent double clicking text selection
    window.addEventListener('selectstart', function (e) {
        e.preventDefault();
        return false;
    });
    window.addEventListener('mousedown', function (e) {
        if (!board_initialised) return;
        if (e.button !== 0 || e.target.tagName !== 'CANVAS') return;
        $menu.hide();
        switch (tools[gm.selectedTool].name) {
            case 'select':
                gm.layerManager.onMouseDown(e);
                break;
            case 'ruler':
                gm.rulerTool.onMouseDown(e);
                break;
        }
    });
    window.addEventListener('mousemove', function (e) {
        if (!board_initialised) return;
        switch (tools[gm.selectedTool].name) {
            case 'select':
                gm.layerManager.onMouseMove(e);
                break;
            case 'ruler':
                gm.rulerTool.onMouseMove(e);
                break;
        }
    });
    window.addEventListener('mouseup', function (e) {
        if (!board_initialised) return;
        switch (tools[gm.selectedTool].name) {
            case 'select':
                gm.layerManager.onMouseUp(e);
                break;
            case 'ruler':
                gm.rulerTool.onMouseUp(e);
                break;
        }
    });
    window.addEventListener('contextmenu', function (e) {
        if (!board_initialised) return;
        switch (tools[gm.selectedTool].name) {
            case 'select':
                gm.layerManager.onContextMenu(e);
                break;
        }
    });
}


let gameManager = new GameManager();


// **** SETUP UI ****
const tools = [
    {name: "select", playerTool: true, defaultSelect: true},
    // {name: "draw", playerTool: true},
    {name: "ruler", playerTool: true, defaultSelect: false},
    {name: "fow", playerTool: false, defaultSelect: false},
];

const toolselectDiv = $("#toolselect").find("ul");
tools.forEach(function(tool) {
    if (!tool.playerTool && !IS_DM) return;
    const extra = tool.defaultSelect ? " class='tool-selected'" : "";
    const toolLi = $("<li id='tool-" + tool.name + "'" + extra + "><a href='#'>" + tool.name + "</a></li>");
    toolselectDiv.append(toolLi);
    toolLi.on("click", function () {
        const index = tools.indexOf(tool);
        if (index !== gameManager.selectedTool) {
            $('.tool-selected').removeClass("tool-selected");
            $(this).addClass("tool-selected");
            gameManager.selectedTool = index;
        }
    });
});

$("#zoomer").slider({
    orientation: "vertical",
    min: 0.5,
    max: 2.0,
    step: 0.1,
    value: 1.0,
    slide: function( event, ui ) {
        gameManager.layerManager.zoomFactor = 1 / ui.value;
        gameManager.layerManager.invalidate(false);
        gameManager.layerManager.drawGrid();
    }
});

const $menu = $('#contextMenu');
$menu.hide();

function handleContextMenu(menu, token) {
    const action = menu.data("action");
    const layer = gameManager.layerManager.getLayer();
    const ls = layer.shapes;
    switch (action) {
        case 'moveToFront':
            layer.moveShapeOrder(token, ls.length - 2);
            break;
        case 'moveToBack':
            layer.moveShapeOrder(token, 0);
            break;
        case 'setLayer':
            layer.removeShape(token);
            gameManager.layerManager.getLayer(menu.data("layer")).addShape(token);
            break;
    }
    $menu.hide();
}

$('#menutoggle').on("click", function () {
    const menu = $('#menu');
    // order of animation is important, it otherwise will sometimes show a small gap between the two objects
    if (menu.is(":visible")) {
        $('#menutoggle').animate({left: "-=200px"});
        menu.animate({width: 'toggle'});
    } else {
        menu.animate({width: 'toggle'});
        $('#menutoggle').animate({left: "+=200px"});
    }
});

window.onresize = function () {
    gameManager.layerManager.setWidth(window.innerWidth);
    gameManager.layerManager.setHeight(window.innerHeight);
    gameManager.layerManager.invalidate(false);
    gameManager.layerManager.drawGrid();
};

$('body').keyup(function(e){
    if(e.keyCode === 46) {
        const l = gameManager.layerManager.getLayer();
        if (l.selection) {
            l.removeShape(l.selection);
        }
    }
});

$("#gridSizeInput").on("change", function(e){
    const gs = parseInt(e.target.value);
    gameManager.layerManager.setGridSize(gs);
    socket.emit("set gridsize", gs);
});

$("#grid-layer").droppable({
    drop: function (event, ui) {
        const l = gameManager.layerManager.getLayer();
        const offset = $(l.canvas).offset();
        x = parseInt(ui.offset.left - offset.left);
        y = parseInt(ui.offset.top - offset.top);
        // width = ui.helper[0].width;
        // height = ui.helper[0].height;
        const img = ui.draggable[0].children[0];
        const token = new Token(img, x, y, img.width, img.height);
        l.addShape(token);
        gameManager.layerManager.imageMap.set(token.uuid, token.img);
    }
});

// **** UTILS ****

// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function findGetParameter(parameterName) {
    let result = null,
        tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
          tmp = item.split("=");
          if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
        });
    return result;
}