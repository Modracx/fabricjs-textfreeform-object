/*!
 * fabric.TextFreeForm — envelope / mesh-warp text effect
 * Kenneth D'silva (Modracx), Copyright (c) June 2025
 * Licensed under the MIT License — https://opensource.org/licenses/MIT
 *
 * No external dependencies. Font via fontFamily (same as fabric.IText).
 * Load web fonts via CSS @font-face or <link> before rendering.
 *
 * Control-point layout (10 points, all normalised 0-1 relative to text W×H):
 *   [0] top-left      [1] top-centre (breakpoint)   [2] top-right
 *   [3] bottom-right  [4] bottom-centre (breakpoint) [5] bottom-left
 *   [6] handle [0]→[1]   [7] handle [1]→[2]
 *   [8] handle [5]→[4]   [9] handle [4]→[3]
 *
 * Warp: text is rendered to an offscreen canvas, then each vertical 1-px
 * column is drawn stretched to fit the corresponding envelope top/bottom
 * positions — the same bilinear mesh used by the reference, without needing
 * individual glyph outlines.
 */
;(function (fabric) {
    'use strict';

    // ── Arc-length-parameterized cubic bezier segment ──────────────────
    class _CubicSeg {
        constructor(p0,p1,p2,p3){this.p=[p0,p1,p2,p3];this._build();}
        _pt(t){const[p0,p1,p2,p3]=this.p,u=1-t;return{x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};}
        _build(N=200){this._lut=[{t:0,d:0}];let prev=this._pt(0),acc=0;for(let i=1;i<=N;i++){const t=i/N,cur=this._pt(t);acc+=Math.hypot(cur.x-prev.x,cur.y-prev.y);this._lut.push({t,d:acc});prev=cur;}this.length=acc;}
        _tFor(d){let lo=0,hi=this._lut.length-1;while(lo<hi-1){const m=(lo+hi)>>1;this._lut[m].d<d?lo=m:hi=m;}const a=this._lut[lo],b=this._lut[hi];return b.d===a.d?a.t:a.t+(d-a.d)/(b.d-a.d)*(b.t-a.t);}
        at(d){return this._pt(this._tFor(Math.max(0,Math.min(d,this.length))));}
    }

    // ── Default 10-point rectangular envelope ─────────────────────────
    const _DEFAULT_CTRL_PTS = [
        {x:0,   y:0},{x:.5,  y:0},{x:1,   y:0},
        {x:1,   y:1},{x:.5,  y:1},{x:0,   y:1},
        {x:.25, y:0},{x:.75, y:0},
        {x:.25, y:1},{x:.75, y:1},
    ];

    fabric.TextFreeForm = fabric.util.createClass(fabric.IText, {
        type: 'text-free-form',
        ctrlPts: null,
        kerning: 0,
        cacheProperties: fabric.IText.prototype.cacheProperties.concat(['ctrlPts','kerning']),

        initialize: function(text, options) {
            options = options || {};
            this.ctrlPts = options.ctrlPts != null
                ? options.ctrlPts
                : _DEFAULT_CTRL_PTS.map(p=>({x:p.x,y:p.y}));
            this.kerning = options.kerning != null ? options.kerning : 0;
            this.callSuper('initialize', text, options);
            this.originX = options.originX != null ? options.originX : 'left';
            this.originY = options.originY != null ? options.originY : 'top';
            this._updateCurve();
        },

        set: function(key, value) {
            const changed = this.callSuper('set', key, value);
            const watched = ['text','fontSize','fontFamily','fontWeight','fontStyle','fontVariant','kerning','ctrlPts'];
            const dirty = typeof key === 'object' ? Object.keys(key).some(k=>watched.includes(k)) : watched.includes(key);
            if (dirty && !this.isEditing) this._updateCurve();
            return changed;
        },

        enterEditing: function() { this.callSuper('enterEditing'); this._flatLayout(); this.setCoords(); },
        exitEditing:  function() { this.callSuper('exitEditing');  this._updateCurve(); this.setCoords(); if(this.canvas)this.canvas.requestRenderAll(); },

        _flatLayout: function() {
            const ctx = fabric.util.createCanvasElement().getContext('2d');
            ctx.font = this._getFontDeclaration();
            const chars = this.text.split('').filter(c=>c!=='\n');
            let w = chars.reduce((s,ch)=>s+ctx.measureText(ch).width, 0);
            if(chars.length>1) w += this.kerning*(chars.length-1);
            this.set({ width:Math.max(1,Math.round(w)), height:Math.max(1,Math.round(this.fontSize*1.2)) });
        },

        // Build the four envelope bezier edge segments from scaled pixel-space pts.
        _buildEdges: function(pts) {
            return {
                topLeft:  new _CubicSeg(pts[0],pts[0],pts[6],pts[1]),
                topRight: new _CubicSeg(pts[1],pts[7],pts[2],pts[2]),
                botLeft:  new _CubicSeg(pts[5],pts[5],pts[8],pts[4]),
                botRight: new _CubicSeg(pts[4],pts[9],pts[3],pts[3]),
                topBpX:   pts[1].x,
                botBpX:   pts[4].x,
                W:        pts[2].x,   // = 1 * W in pixel space
            };
        },

        _getTopAt: function(x, e) {
            if(x <= e.topBpX){
                const r = e.topBpX > 0 ? x/e.topBpX : 0;
                return e.topLeft.at(r*e.topLeft.length);
            }
            const r = (e.W-e.topBpX)>0 ? (x-e.topBpX)/(e.W-e.topBpX) : 1;
            return e.topRight.at(r*e.topRight.length);
        },

        _getBotAt: function(x, e) {
            if(x <= e.botBpX){
                const r = e.botBpX > 0 ? x/e.botBpX : 0;
                return e.botLeft.at(r*e.botLeft.length);
            }
            const r = (e.W-e.botBpX)>0 ? (x-e.botBpX)/(e.W-e.botBpX) : 1;
            return e.botRight.at(r*e.botRight.length);
        },

        _updateCurve: function() {
            if(!this.ctrlPts){this._flatLayout();return;}
            const ctx = fabric.util.createCanvasElement().getContext('2d');
            ctx.font = this._getFontDeclaration();
            const chars = this.text.split('').filter(c=>c!=='\n');
            const n = chars.length;
            if(!n){this._flatLayout();return;}
            const cw = chars.map(ch=>ctx.measureText(ch).width);
            const W = cw.reduce((s,w)=>s+w,0) + this.kerning*Math.max(0,n-1);
            const H = this.fontSize;

            const pts = this.ctrlPts.map(p=>({x:p.x*W,y:p.y*H}));
            const e   = this._buildEdges(pts);

            // Bounding box: sample envelope at 20 columns
            let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
            for(let k=0;k<=20;k++){
                const x=(k/20)*W;
                const top=this._getTopAt(x,e), bot=this._getBotAt(x,e);
                if(top.x<minX)minX=top.x; if(bot.x<minX)minX=bot.x;
                if(top.x>maxX)maxX=top.x; if(bot.x>maxX)maxX=bot.x;
                if(top.y<minY)minY=top.y;
                if(bot.y>maxY)maxY=bot.y;
            }
            const pad = (this.strokeWidth||0)/2 + 1;
            minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;

            const width=Math.max(1,maxX-minX), height=Math.max(1,maxY-minY);
            this._bbX=minX+width/2; this._bbY=minY+height/2;
            this._cw=cw; this._chars=chars;
            this._W=W; this._H=H; this._pts=pts; this._edges=e;
            this.set({width,height});
        },

        _render: function(ctx) {
            if(this.isEditing || !this._edges){this.callSuper('_render',ctx);return;}

            const {_cw:cw,_chars:chars,_W:W,_H:H,_pts:pts,_edges:e}=this;
            const n = chars.length;

            // 1. Render full flat text to offscreen canvas.
            //    Baseline at H*0.82 so ascenders fit above and descenders below.
            const W_int = Math.max(1, Math.ceil(W));
            const H_int = Math.max(1, Math.ceil(H));
            const off   = fabric.util.createCanvasElement();
            off.width   = W_int;
            off.height  = H_int;
            const oct   = off.getContext('2d');
            oct.font         = this._getFontDeclaration();
            oct.textBaseline = 'alphabetic';
            oct.textAlign    = 'left';
            oct.fillStyle    = this.fill;
            const baselineY  = H_int * 0.82;
            let xOff = 0;
            chars.forEach((ch,i)=>{
                if(this.stroke&&this.strokeWidth>0){
                    oct.strokeStyle=this.stroke; oct.lineWidth=this.strokeWidth;
                    oct.strokeText(ch,xOff,baselineY);
                }
                oct.fillText(ch, xOff, baselineY);
                xOff += cw[i] + (i<n-1?this.kerning:0);
            });

            // 2. Warp: for each 1-px source column, drawImage to the envelope-warped position.
            ctx.save();
            ctx.translate(-(this._bbX||0), -(this._bbY||0));

            for(let xi=0; xi<W_int; xi++){
                const top = this._getTopAt(xi, e);
                const bot = this._getBotAt(xi, e);
                const xDst = (top.x + bot.x) * 0.5;
                const dstH = bot.y - top.y;
                if(dstH <= 0) continue;
                ctx.drawImage(off, xi, 0, 1, H_int, xDst, top.y, 1, dstH);
            }

            ctx.restore();
        },

        toObject: function(props){ return this.callSuper('toObject',['ctrlPts','kerning'].concat(props||[])); },
    });

    fabric.TextFreeForm.fromObject = function(object,callback,forceAsync){
        return fabric.Object._fromObject('TextFreeForm',object,callback,forceAsync);
    };
})(typeof fabric !== 'undefined' ? fabric : require('fabric').fabric);
