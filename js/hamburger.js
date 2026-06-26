

function CreateMenu()
{
    const target = document.getElementById("headermain");
    console.log("target: " + target);
    target.innerHTML = `
<style>
#headermain {
position: fixed;
background-color: rgb(12, 18, 24);
border-bottom: solid 2px #eeeeeeff;
top: 0%;
width: 100%; height: 50px;
margin: 0px; padding: 0px 0px 0px 8px;
z-index: 100;
}
h1 { margin: 0px; padding: 0px 0px 0px 16px; }
button{
position: relative;
background-color: #00000000;
border: #00000000;
color: #eeeeeeff;
/*font-family: var(--HeadFont),Yu Gothic, Arial;*/
margin: 0px; padding: 4px 16px 4px 0px;
width: 100%; height: 50px;
right: 0%;
text-align: right;
vertical-align: bottom;
font-size: 28px;
white-space: nowrap;
transition: all 0.3s 0s ease;
}
button:hover{
background-color: #00000060;
transition: all 0.3s 0s ease;
}

/*ヘッダーのボタン(ハンバーガーボタン)*/
#hbbutton{
position: fixed;
width: 35px; height: 35px;
right: 8px; top: 7px;
background-color: #00000000; border: #00000000;
transition: all 0.3s 0s ease;
}
#hbbutton:hover{ transform: scale(1.2); transition: all 0.3s 0s ease; }
.hoverChangeScale{ transition: all 0.3s 0s ease; }
.hoverChangeScale:hover{ transform: scale(1.2); transition: all 0.3s 0s ease; }
.hbline{
position: absolute;
width: 30px; height: 2px;
right: 0%;
background-color: #eeeeeeff;
}
#headermain.op #hbline1{
background-color: #00000000;
transform: translate(0px,-7px); transition: all 0.3s 0s ease;
}
#headermain.op #hbline3{
background-color: #00000000;
transform: translate(0px,7px); transition: all 0.3s 0s ease;
}
#headermain.op #hbline2_1{ transform: rotate(135deg); transition: all 0.3s 0s ease; }
#headermain.op #hbline2_2{ transform: rotate(225deg); transition: all 0.3s 0s ease; }
#headermain.cl #hbline1{ transform: translate(0px,0px); transition: all 0.3s 0s ease; }
#headermain.cl #hbline3{ transform: translate(0px,0px); transition: all 0.3s 0s ease; }
#headermain.cl #hbline2_1{ transform: rotate(0deg); transition: all 0.3s 0s ease; }
#headermain.cl #hbline2_2{ transform: rotate(0deg); transition: all 0.3s 0s ease; }
#hbline1{ top: 20%; transition: all 0.3s 0s ease; }
#hbline2_1{ top: 50%; transition: all 0.3s 0s ease; }
#hbline2_2{ top: 50%; transition: all 0.3s 0s ease; }
#hbline3{ top: 80%; transition: all 0.3s 0s ease; }

/*ハンバーガーメニュー*/
:root{
--hmenu_Width: 470px;
--hmenu_Border: 1px;
}
@media screen and (max-width:750px){:root{
--hmenu_Width: 100vw;
}}
#hmenu{
position: fixed;
right: calc(var(--hmenu_Width) * -1); top: 50px; bottom: 0%;
width: calc(var(--hmenu_Width) - var(--hmenu_Border));
background-color: #222222ee;
overflow-y: auto; overflow-x: hidden;
border-left: solid var(--hmenu_Border) var(--Border_Color);
/*-ms-overflow-style:none;/* IE,Edge*//*scrollbar-width: none;/* Firefox*/
}
#hmenu::-webkit-scrollbar { width: 8px; }
#hmenu::-webkit-scrollbar-track { background-color: #333333; }
#hmenu::-webkit-scrollbar-thumb { background-color: #555555; border-radius: 100px; }
#headermain.op #hmenu{ transform: translate(calc(var(--hmenu_Width) * -1),0px); transition: transform .3s; }
#headermain.cl #hmenu{ transform: translate(0px,0px); transition: transform .3s; }
</style>

<button id="hbbutton" class="blborder" onclick="ClickHB()">
<span class="hbline" id="hbline1"></span>
<span class="hbline" id="hbline2_1"></span>
<span class="hbline" id="hbline2_2"></span>
<span class="hbline " id="hbline3"></span>
</button>

<div style="height: 100%;">
<a href="/index.html">
<img src="/images/kitihi20_icon_bold_512.webp" width="40px" height="100%" 
class="hoverChangeScale" style="position:absolute; object-fit: contain; right: 60px;">
</a>
</div>

<div id="hmenu">
<hr>
<a href="/index.html"><button>TOP</button></a>
<!--<a href="./About.html"><button>About</button></a>-->
<hr>
<h1>Works</h1>
<a href="/html/N2M4.html"><button>No Name Mech</button></a>
<a href="/html/Voidlase.html"><button>VOIDLASE</button></a>
<a href="/html/Works.html"><button>作品一覧</button></a>
<hr>
<a href="/html/Other.html"><button>その他</button></a>
<hr>
</div>
`;
}

CreateMenu();


let OpenHB = false;

function ClickHB()
{
    let element = document.getElementById("headermain");
    OpenHB = !OpenHB;
    if(OpenHB)
    {
        element.classList.add("op");
        element.classList.remove("cl");
    }else{
        element.classList.remove("op");
        element.classList.add("cl");
    }
}