
/* ==============================================================
   Brain Buddy v87 — PET CORE MODULE
   Architecture:
     API      = Supabase only
     Store    = pet state only
     UI       = DOM render only
     Bridge   = existing Brain Buddy events
   Future files can extend window.BrainBuddyPet without editing index.
   ============================================================== */
(function(){
  "use strict";

  const DEFAULT_STATE={
    pet_name:"Pink Buddy",
    hunger:100,
    happiness:100,
    energy:100,
    care_xp:0,
    game_xp:0,
    total_pet_xp:0,
    pet_level:1,
    level_progress:0,
    level_target:500,
    mood:"happy",
    coin_balance:0,
    cloud:false,
    guest:true
  };

  const PET_CONFIG=Object.freeze({
    levelSize:500,
    statMin:0,
    statMax:100
  });

  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,Number(n)||0));
  const byId=id=>document.getElementById(id);

  function client(){
    if(window.__bbSupabase)return window.__bbSupabase;

    const cfg=window.BRAIN_BUDDY_SUPABASE||{};
    if(window.supabase&&cfg.url&&cfg.publishableKey){
      window.__bbSupabase=window.supabase.createClient(
        cfg.url,
        cfg.publishableKey
      );
      return window.__bbSupabase;
    }

    return null;
  }

  class PetStore extends EventTarget{
    constructor(){
      super();
      this.state={...DEFAULT_STATE};
    }

    set(next){
      this.state={...this.state,...next};
      this.dispatchEvent(
        new CustomEvent("change",{detail:this.state})
      );

      document.dispatchEvent(
        new CustomEvent("bb:pet-updated",{detail:this.state})
      );
    }

    get(){
      return {...this.state};
    }
  }

  const store=new PetStore();

  const API={
    async load(){
      const c=client();

      if(!c){
        return {...DEFAULT_STATE,cloud:false,guest:true};
      }

      const {data:sessionData,error:sessionError}=await c.auth.getSession();
      if(sessionError)throw sessionError;

      const user=sessionData?.session?.user||null;

      if(!user){
        return {...DEFAULT_STATE,cloud:false,guest:true};
      }

      const {data,error}=await c.rpc("bb_get_my_pet");
      if(error)throw error;

      const row=Array.isArray(data)?data[0]:data;
      if(!row)throw new Error("ระบบ Buddy ไม่ได้ส่งข้อมูลกลับมา");

      return {
        pet_name:row.pet_name||"Pink Buddy",
        hunger:clamp(row.hunger),
        happiness:clamp(row.happiness),
        energy:clamp(row.energy),
        care_xp:Number(row.care_xp)||0,
        game_xp:Number(row.game_xp)||0,
        total_pet_xp:Number(row.total_pet_xp)||0,
        pet_level:Math.max(1,Number(row.pet_level)||1),
        level_progress:Math.max(0,Number(row.level_progress)||0),
        level_target:Math.max(1,Number(row.level_target)||PET_CONFIG.levelSize),
        mood:row.mood||"happy",
        coin_balance:Number(row.coin_balance)||0,
        cloud:true,
        guest:false
      };
    },

    async rename(name){
      const c=client();
      if(!c)throw new Error("Cloud ยังไม่พร้อม");

      const cleaned=String(name||"").trim().slice(0,24);
      if(!cleaned)throw new Error("กรุณาใส่ชื่อ Buddy");

      const {data,error}=await c.rpc(
        "bb_pet_rename",
        {p_name:cleaned}
      );

      if(error)throw error;
      return Array.isArray(data)?data[0]:data;
    }
  };

  const UI={
    moodText(state){
      if(state.mood==="hungry")return "หิวแล้วนิดหน่อย 🍓";
      if(state.mood==="sad")return "อยากให้มาเล่นด้วย 🥺";
      if(state.mood==="tired")return "กำลังพักพลัง ⚡";
      if(state.mood==="great")return "แฮปปี้สุด ๆ ✨";
      return "กำลังอารมณ์ดี 💕";
    },

    render(state){
      const root=byId("bbPetHomeCard");
      if(!root)return;

      root.dataset.petMood=state.mood||"happy";

      const name=byId("bbPetName");
      const level=byId("bbPetLevel");
      const happyValue=byId("bbPetHappyValue");
      const hungerValue=byId("bbPetHungerValue");
      const energyValue=byId("bbPetEnergyValue");
      const happyBar=byId("bbPetHappyBar");
      const hungerBar=byId("bbPetHungerBar");
      const energyBar=byId("bbPetEnergyBar");
      const xpBar=byId("bbPetXpBar");
      const xpText=byId("bbPetXpText");
      const mood=byId("bbPetMood");
      const cloudNote=byId("bbPetCloudNote");

      if(name)name.textContent=state.pet_name||"Pink Buddy";
      if(level)level.textContent=`Lv. ${state.pet_level||1}`;

      if(happyValue)happyValue.textContent=`${Math.round(state.happiness)}%`;
      if(hungerValue)hungerValue.textContent=`${Math.round(state.hunger)}%`;
      if(energyValue)energyValue.textContent=`${Math.round(state.energy)}%`;

      if(happyBar)happyBar.style.width=`${clamp(state.happiness)}%`;
      if(hungerBar)hungerBar.style.width=`${clamp(state.hunger)}%`;
      if(energyBar)energyBar.style.width=`${clamp(state.energy)}%`;

      const progress=state.level_target>0
        ? clamp((state.level_progress/state.level_target)*100)
        : 0;

      if(xpBar)xpBar.style.width=`${progress}%`;

      if(xpText){
        xpText.textContent=state.guest
          ?"เข้าสู่ระบบเพื่อบันทึกเลเวล Buddy"
          :`${Number(state.level_progress).toLocaleString()} / ${Number(state.level_target).toLocaleString()} EXP สู่เลเวลถัดไป`;
      }

      if(mood)mood.textContent=UI.moodText(state);

      cloudNote?.classList.toggle("hidden",!state.guest);
    }
  };

  let loading=null;

  async function refresh(){
    if(loading)return loading;

    loading=(async()=>{
      try{
        const next=await API.load();
        store.set(next);
        return next;
      }catch(err){
        console.warn("Brain Buddy Pet Core:",err);

        const fallback={
          ...DEFAULT_STATE,
          cloud:false,
          guest:true
        };

        store.set(fallback);
        return fallback;
      }finally{
        loading=null;
      }
    })();

    return loading;
  }

  store.addEventListener("change",e=>UI.render(e.detail));

  /* Existing game EXP already lives in profiles.xp.
     bb_get_my_pet reads that value, so a successful game automatically
     moves Buddy Level without a second reward transaction. */
  document.addEventListener("bb:profile-updated",()=>{
    refresh();
  });

  window.addEventListener("bb:auth-changed",()=>{
    refresh();
  });

  window.addEventListener("pageshow",()=>{
    refresh();
  });

  /* Public API for future isolated modules:
     pet-feeding.js, pet-food-shop.js, pet-missions.js, etc. */
  window.BrainBuddyPet=Object.freeze({
    version:"87.0",
    config:PET_CONFIG,
    store,
    api:API,
    refresh,
    getState:()=>store.get()
  });

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",refresh,{once:true});
  }else{
    refresh();
  }
})();
