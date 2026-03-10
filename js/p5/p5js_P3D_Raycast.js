
/*
https://editor.p5js.org/
*/

//疑似3D
//wasdキーで移動、左右矢印キーで旋回
//同時に複数のキーを押せない

//反射も付けた

//素直にVector2作ればよかった

w = 400;
h = 400;

blocksize = 10;
widthpixel = 3;

playerMoveSpeed = 0.5;
playerRotSpeed = 2;
fov = 40;
maxRayDist = 120;
maxRef = 4;

backgroundColor = 0;

startpoint = [4,4]
stage = [
[1,1,1,1,1,1,1,1,1,1],
[1,0,0,0,0,1,0,0,0,1],
[1,0,1,0,0,1,1,1,0,1],
[1,0,1,0,0,0,0,1,0,1],
[1,0,1,0,0,1,1,1,0,1],
[1,0,1,0,0,0,0,0,0,1],
[1,0,1,0,0,0,1,0,0,1],
[1,0,0,0,1,1,1,1,0,1],
[1,0,1,0,0,0,0,0,0,1],
[1,1,1,1,1,1,1,1,1,1]
];
/*
startpoint = [3.5,8]
stage = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,1,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,1],
    [1,0,1,0,1,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
    ];
*/

colorlist = [
[1,1,1],
[1,0,0],
[1,1,1],
[0,1,0],
[1,1,1],
[0,0,1],
[1,1,1],
[0,1,1],
[1,1,1],
[1,0,1],
[1,1,1],
[1,1,0],
[1,1,1],
]

Deg2Rad = Math.PI/180;
let L2;

//ステージ上に置く四角
class asRectangle
{
    constructor(posx,posy, sizex,sizey, clr_r=1,clr_g=1,clr_b=1, ref=false)
    {
        this.px = posx;
        this.py = posy;
        this.sx = sizex;
        this.sy = sizey;

        this.color_r = clr_r;
        this.color_g = clr_g;
        this.color_b = clr_b;

        this.ref = ref;
        
        //普段四角形の中央が原点の位置だからよく間違える...
        //00 10 11 01
        this.vps = [
                [posx, posy], 
                [posx + sizex, posy], 
                [posx + sizex, posy + sizey],
                [posx, posy + sizey]];
    }

    draw()
    {
        //UI表示
        L2.stroke(0);
        L2.fill(this.color_r*255,this.color_g*255,this.color_b*255);
        L2.rect(this.px,this.py,this.sx,this.sy);
        if(this.ref)
        {
            L2.line(this.vps[0][0],this.vps[0][1],this.vps[2][0],this.vps[2][1]);
        }
    }

    raycast(maxdist, rayx,rayy, vecx,vecy)
    {
        //雑にrayが当たらないかを確認
        if(vecx > 0) { if(rayx > this.vps[2][0]){ return null; } }
        else { if(rayx < this.vps[0][0]){ return null; } }
        if(vecy > 0) { if(rayy > this.vps[2][1]){ return null; } }
        else { if(rayy < this.vps[0][1]){ return null; } }

        //raycast
        let disttmp = 0;
        let distres = Math.pow(maxdist,2)+1;
        let pos = [];
        let respos = [];
        let normalx = 0;
        let normaly = 0;
        //四辺
        for(let i = 0; i < this.vps.length; i++)
        {
            //交点を調べる
            if(i == 0)
            {
                pos = intersection(rayx,rayy, rayx+vecx*maxdist,rayy+vecy*maxdist, this.vps[this.vps.length-1][0],this.vps[this.vps.length-1][1], this.vps[i][0],this.vps[i][1]);
            }else{
                pos = intersection(rayx,rayy, rayx+vecx*maxdist,rayy+vecy*maxdist, this.vps[i-1][0],this.vps[i-1][1], this.vps[i][0],this.vps[i][1]);
            }
            //交わらない場合スキップ
            if(pos.length <= 0){ continue; }
            //距離が近いものを採用
            disttmp = sqrDistance(rayx,rayy, pos[0],pos[1]);
            if(distres > disttmp)
            {
                distres = disttmp;
                respos = pos;
                //00 10 11 01
                if(i == 0){ normalx = -1; normaly = 0; }
                else if(i == 1){ normalx = 0; normaly = -1; }
                else if(i == 2){ normalx = 1; normaly = 0; }
                else if(i == 3){ normalx = 0; normaly = 1; }
            }
        }
        //一度も交わらない場合null
        if(distres >= Math.pow(maxdist,2)) { return null; }
        //結果
        return new hitResult(respos[0],respos[1], normalx,normaly, Math.sqrt(distres), this.color_r,this.color_g,this.color_b, this.ref);
    }
}

//Player
class player
{
    constructor(x,y)
    {
        this.x = x;
        this.y = y;
        this.r = 0;
    }
    update()
    {
        //キー入力、移動
        if (keyIsPressed === true)
        {
            if (key === 'w')
            {
                let v = angle2vector(this.r-90);
                this.x += v[0] * playerMoveSpeed;
                this.y += v[1] * playerMoveSpeed;
            }
            else if (key === 's')
            {
                let v = angle2vector(this.r-90);
                this.x -= v[0] * playerMoveSpeed;
                this.y -= v[1] * playerMoveSpeed;
            }
            else if (key === 'a')
            {
                let v = angle2vector(this.r);
                this.x -= v[0] * playerMoveSpeed;
                this.y -= v[1] * playerMoveSpeed;
            }
            else if (key === 'd')
            {
                let v = angle2vector(this.r);
                this.x += v[0] * playerMoveSpeed;
                this.y += v[1] * playerMoveSpeed;
            }
            else if (key === 'ArrowLeft')
            {
                this.r -= playerRotSpeed;
            }
            else if (key === 'ArrowRight')
            {
                this.r += playerRotSpeed;
            }
        }
    }
    draw()
    {
        //UI表示
        L2.stroke(0);
        L2.fill(255);
        L2.circle(this.x,this.y,blocksize);
    }
}

//raycastの衝突結果入れる用
class hitResult
{
    constructor(posx,posy, normx,normy, dist, clr_r,clr_g,clr_b, ref)
    {
        this.x = posx;
        this.y = posy;
        this.normalx = normx;
        this.normaly = normy;
        this.dist = dist;
        this.color_r = clr_r;
        this.color_g = clr_g;
        this.color_b = clr_b;
        this.ref = ref;
    }
}

//ステージをraycast
function raycastRects(rects,maxdist, rayx,rayy, vecx,vecy)
{
    let hit = null;
    let hittmp;

    for(let i = 0; i < rects.length; i++)
    {
        hittmp = rects[i].raycast(maxdist, rayx,rayy, vecx,vecy);
        if(hittmp == null) { continue; }
        if(hit == null) { hit = hittmp; }
        else if(hittmp.dist < hit.dist) { hit = hittmp; }
    }

    if(hit == null)
    {
        L2.stroke(255,0,0);
        L2.line(rayx,rayy, rayx+vecx*maxdist,rayy+vecy*maxdist);
    }else
    {
        L2.stroke(0,255,0);
        L2.line(rayx,rayy, rayx+vecx*hit.dist,rayy+vecy*hit.dist);
    }
    
    return hit;
}

//内積
function dot(x0,y0, x1,y1)
{
    return x0*x1+y0*y1;
}
//外積
function cross(x0,y0, x1,y1)
{
    return x0*y1-y0*x1;
}
//交差点
function intersection(x0,y0, x1,y1, x2,y2, x3,y3)
{
    let c = cross(x1-x0,y1-y0, x3-x2,y3-y2);
    if(c === 0){ return []; }
    let s = cross(x2-x0, y2-y0, x3-x2, y3-y2) / c;
    let t = cross(x1-x0, y1-y0, x0-x2, y0-y2) / c;
    if (s < 0.0 || 1.0 < s || t < 0.0 || 1.0 < t){ return []; }
    return [x0 + s*(x1-x0), y0 + s*(y1-y0)];
}
//距離(二点間)
function distance(x0,y0, x1,y1)
{
    return Math.sqrt(Math.pow(x0-x1,2) + Math.pow(y0-y1,2));
    //jsのバイナリ周り信頼できん...
}
//距離(ベクトル)
function distance(x0,y0)
{
    return Math.sqrt(Math.pow(x0,2) + Math.pow(y0,2));
}
//距離(平方根無し)
function sqrDistance(x0,y0, x1,y1)
{
    return Math.pow(x0-x1,2) + Math.pow(y0-y1,2);
    //jsのバイナリ周り信頼できん...
}
//角度から方向ベクトルへ
function angle2vector(angle)
{
    let r = angle*Deg2Rad;
    return [Math.cos(r), Math.sin(r)];
}
//反射
function reflection(rayvecx,rayvecy, normalx,normaly)
{
    let res = [0,0];
    let dotres = dot(rayvecx,rayvecy, normalx,normaly);
    res[0] = rayvecx + 2 * -dotres * normalx;
    res[1] = rayvecy + 2 * -dotres * normaly;
    let dis = distance(res[0],res[1]);
    res[0] = res[0]/dis;
    res[1] = res[1]/dis;
    return res;
}

//初期化
function setup()
{
    createCanvas(400, 400);
    L2 = createGraphics(400, 400);
    rects = [];
    //player
    pl = new player(startpoint[0]*blocksize,startpoint[1]*blocksize);
    //stage
    for(let i = 0; i < stage[0].length; i++)
    {
        for(let j = 0; j < stage.length; j++)
        {
            if(stage[j][i] != 0)
            {
                let clrindex = (j*stage[0].length+i)%colorlist.length;
                rects.push(new asRectangle(
                    i*blocksize,j*blocksize, 
                    blocksize,blocksize, 
                    colorlist[clrindex][0],colorlist[clrindex][1],colorlist[clrindex][2],
                    (j*stage[0].length+i)%4 == 0));
            }
        }
    }
    //test
    rects.push(new asRectangle(
        12*blocksize,0,
        blocksize,blocksize*10));
}

//毎フレーム実行
function draw()
{
    //背景クリア
    background(backgroundColor);
    stroke(backgroundColor);
    //UIクリア
    L2.clear();
    L2.stroke(0);

    //player
    pl.update();
    pl.draw();

    //stage
    for(let i = 0; i < rects.length; i++)
    {
        rects[i].draw();
    }

    //raycast
    let wnum = w/widthpixel/2;
    let vectmp = [0,0];
    let hittmp = null;
    for(let i = -wnum; i < wnum; i++)
    {
        let angle = fov*(i/wnum);
        vectmp = angle2vector(pl.r+angle-90);
        let ac = Math.cos(angle*Deg2Rad);
        let mdis = maxRayDist / ac;
        let hitres = new hitResult(pl.x,pl.y, 0,1, 0, 1,1,1, false);

        let cont = false;
        for(let j = 0; j < maxRef; j++)
        {
            hittmp = raycastRects(rects, mdis-hitres.dist, hitres.x,hitres.y, vectmp[0],vectmp[1]);
            if(hittmp == null) 
            {
                cont=true;
                break;
            }
            
            //こっちだとうまくいかない
            /*hitres = new hitResult(
                hittmp.x,hittmp.y,
                hittmp.normalx,hittmp.normaly,
                hitres.dist + hittmp.dist,
                hittmp.color_r,hittmp.color_g,hittmp.clr_b,
                hittmp.ref
            );*/
            //こっちならうまくいく
            hitres.x = hittmp.x;
            hitres.y = hittmp.y;
            hitres.normalx = hittmp.normalx;
            hitres.normaly = hittmp.normaly;
            hitres.dist = hitres.dist + hittmp.dist;
            hitres.color_r = hitres.color_r * hittmp.color_r;
            hitres.color_g = hitres.color_g * hittmp.color_g;
            hitres.color_b = hitres.color_b * hittmp.color_b;
            hitres.ref = hittmp.ref;

            if(hitres.ref == false)
            {
                break;
            }
            if(hitres.dist >= mdis)
            {
                break;
            }

            vectmp = reflection(vectmp[0],vectmp[1] ,hittmp.normalx,hittmp.normaly);
            hitres.x = hitres.x + vectmp[0] * 0.001;
            hitres.y = hitres.y + vectmp[1] * 0.001;

        }
        if(cont) { continue; }

        let depth = hitres.dist/mdis;
        let onDepth = 1-depth;
        //let scpos = maxRayDist/disttmp*50;
        let scpos = mdis/hitres.dist*50/(maxRayDist/100);
        
        stroke(hitres.color_r*onDepth*255, hitres.color_g*onDepth*255, hitres.color_b*onDepth*255);
        fill(hitres.color_r*onDepth*255, hitres.color_g*onDepth*255, hitres.color_b*onDepth*255);
        rect((i+wnum)*widthpixel,h/2-(scpos/2), widthpixel,scpos);
    }

    //UI表示
    image(L2, 0, 0);

}