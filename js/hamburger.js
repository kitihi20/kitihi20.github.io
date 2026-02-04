

function CreateMenu()
{
    const target = document.getElementById("headermain");
    console.log("target: " + target);
    target.innerHTML = `
<button id="hbbutton" class="blborder" onclick="ClickHB()">
  <span class="hbline" id="hbline1"></span>
  <span class="hbline" id="hbline2_1"></span>
  <span class="hbline" id="hbline2_2"></span>
  <span class="hbline " id="hbline3"></span>
</button>

<div style="height: 100%;">
  <a href="/index.html">
    <img src="/images/kitihi20_icon_bold_512.webp" width="32px" height="100%" 
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
  <!--<hr>-->
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