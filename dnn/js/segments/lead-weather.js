// ═══════════════════════════════════════════════════════════════════════════
// DNN Segment: Lead Weather — Weekly Global Conflict Report
// ═══════════════════════════════════════════════════════════════════════════

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeFarewell() {
  const h = new Date().getHours();
  if (h < 12) return 'Have a good morning.';
  if (h < 17) return 'Have a good afternoon.';
  return 'Good night.';
}

export const LeadWeather = {
  id: 'lead-weather',
  name: 'LEAD WEATHER',
  subtitle: 'Global Conflict Report',
  voice: 'af_heart',

  // ─── DATA ───────────────────────────────────────────────────────────────

  conflicts: [
    { name:"Gaza / West Bank", region:"Middle East", lat:31.5, lng:34.5, killed:847, events:312, type:"armed conflict", note:"Ongoing military operations. Figures represent reported fatalities across both territories for the week." },
    { name:"Sudan — Darfur", region:"Africa", lat:13.5, lng:25.0, killed:623, events:89, type:"civil war", note:"RSF and SAF clashes continuing across Darfur. Mass displacement ongoing. Access for reporters severely restricted." },
    { name:"Ukraine — Eastern Front", region:"Europe", lat:48.8, lng:37.5, killed:580, events:1240, type:"interstate war", note:"Heavy fighting along Donetsk and Zaporizhzhia lines. Figures represent estimated combined casualties." },
    { name:"Myanmar", region:"Southeast Asia", lat:19.5, lng:96.5, killed:312, events:178, type:"civil war", note:"Resistance forces and junta military in sustained conflict across multiple states. Significant civilian toll." },
    { name:"DRC — Eastern Provinces", region:"Africa", lat:-1.5, lng:28.8, killed:289, events:134, type:"armed conflict", note:"M23 and FARDC engagements in North Kivu and South Kivu. Humanitarian situation critical." },
    { name:"Mexico — Cartel Violence", region:"North America", lat:25.0, lng:-105.0, killed:167, events:213, type:"organised crime", note:"CJNG, Sinaloa cartel clashes and state security operations across Sinaloa, Chihuahua, Guerrero states." },
    { name:"Somalia", region:"Africa", lat:5.5, lng:45.5, killed:187, events:96, type:"insurgency", note:"Al-Shabaab operations against federal government forces and ATMIS peacekeepers." },
    { name:"Ethiopia — Amhara", region:"Africa", lat:11.5, lng:37.8, killed:156, events:67, type:"civil conflict", note:"Fano militia and Ethiopian National Defence Force clashes continuing in Amhara region." },
    { name:"Mali / Burkina Faso", region:"West Africa", lat:14.2, lng:-2.5, killed:143, events:58, type:"insurgency", note:"Sahel jihadist groups JNIM and ISGS active across both countries. Civilian casualties high." },
    { name:"Yemen", region:"Middle East", lat:15.5, lng:44.5, killed:134, events:212, type:"civil war", note:"Houthi operations and coalition airstrikes continuing. Red Sea shipping corridor incidents included." },
    { name:"Sudan — Khartoum", region:"Africa", lat:15.5, lng:32.5, killed:98, events:44, type:"civil war", note:"RSF control of most of Khartoum. SAF attempting urban recapture. Civilian infrastructure destroyed." },
    { name:"Nigeria — North East", region:"West Africa", lat:11.8, lng:13.5, killed:98, events:43, type:"insurgency", note:"ISWAP and Boko Haram attacks on civilian and military targets in Borno and Adamawa states." },
    { name:"Iraq / Syria — IS remnants", region:"Middle East", lat:34.5, lng:40.5, killed:67, events:89, type:"insurgency", note:"Islamic State sleeper cell activity and coalition counter-terrorism operations across border region." },
    { name:"Haiti", region:"Caribbean", lat:18.9, lng:-72.3, killed:54, events:38, type:"gang conflict", note:"Gang coalition Viv Ansanm controlling significant Port-au-Prince territory. Police and civilian casualties." },
    { name:"Colombia", region:"South America", lat:4.5, lng:-74.5, killed:43, events:29, type:"armed conflict", note:"FARC dissidents, ELN, and Colombian security forces clashes across Arauca and Cauca departments." },
    { name:"Mozambique — Cabo Delgado", region:"Africa", lat:-12.5, lng:40.2, killed:38, events:22, type:"insurgency", note:"Ansar al-Sunna (ISIS affiliate) attacks on villages and infrastructure in northern Mozambique." },
    { name:"Pakistan — Balochistan / KP", region:"South Asia", lat:32.5, lng:69.5, killed:34, events:47, type:"insurgency", note:"TTP and BLA attacks on security forces. Cross-border incidents with Afghanistan ongoing." },
    { name:"Cameroon — Anglophone", region:"Africa", lat:6.2, lng:10.8, killed:28, events:19, type:"separatist conflict", note:"Ambazonian separatist groups and Cameroon military in North West and South West regions." },
    { name:"Lebanon", region:"Middle East", lat:33.8, lng:35.8, killed:21, events:34, type:"armed conflict", note:"Residual cross-border incidents and internal armed incidents following ceasefire agreement." },
    { name:"Libya", region:"North Africa", lat:27.5, lng:18.5, killed:18, events:24, type:"armed conflict", note:"Tripoli-based and eastern-based faction skirmishes. Mercenary group activity in south." },
  ],

  get totalKilled() {
    return this.conflicts.reduce((a, c) => a + c.killed, 0);
  },

  get totalEvents() {
    return this.conflicts.reduce((a, c) => a + c.events, 0);
  },

  get editionDate() {
    // For now, hardcoded — will become dynamic
    return 'Week of 17 March 2026';
  },

  // ─── SCRIPT (what the presenter reads) ──────────────────────────────────
  // Each entry: { text, onStart(ui) }
  // ui provides: showLowerThird, updateChyron, addStatCard, clearCards

  getScript(ui) {
    return [
      {
        text: `${timeGreeting()}.`,
        onStart: () => {
          ui.showLowerThird("LEAD WEATHER", `${this.editionDate} — Global Conflict Report`);
          ui.clearHighlight();
        }
      },
      {
        text: "I'm your Led Weather presenter. This is your weekly briefing on where the world is at war.",
        onStart: () => { ui.flyWide(); ui.clearHighlight(); }
      },
      {
        text: "This week, armed conflict was active in twenty zones around the world.",
        onStart: () => {
          ui.addStatCard("Global", "Active Conflict Zones", 20, "zones this week", "#e8a010");
          ui.flyWide();
          ui.clearHighlight();
        }
      },
      {
        text: "Our lead story: Gaza and the West Bank. Eight hundred and forty seven people killed in seven days. Eight hundred and forty seven.",
        onStart: () => {
          ui.updateChyron("LEAD STORY", "Gaza / West Bank \u00b7 847 Killed This Week");
          ui.addStatCard("Middle East", "Gaza / West Bank", 847, "killed this week", "#c0392b");
          ui.flyTo(31.5, 34.5, 7);
          ui.highlightCountries(["Palestine", "Israel"]);
        }
      },
      {
        text: "In Sudan's Darfur region, six hundred and twenty three deaths were recorded. RSF and government forces continue to fight. Journalists cannot get in.",
        onStart: () => {
          ui.updateChyron("AFRICA", "Sudan \u2014 Darfur \u00b7 623 Killed This Week");
          ui.addStatCard("Africa", "Sudan \u2014 Darfur", 623, "killed this week", "#c0392b");
          ui.flyTo(13.5, 25.0, 6);
          ui.highlightCountries(["Sudan"]);
        }
      },
      {
        text: "Ukraine's eastern front: an estimated five hundred and eighty casualties this week, across the Donetsk and Zaporizhzhia lines.",
        onStart: () => {
          ui.updateChyron("EUROPE", "Ukraine \u2014 Eastern Front \u00b7 580 Killed This Week");
          ui.addStatCard("Europe", "Ukraine \u2014 Eastern Front", 580, "killed this week", "#d35400");
          ui.flyTo(48.8, 37.5, 6);
          ui.highlightCountries(["Ukraine"]);
        }
      },
      {
        text: "Myanmar, the Democratic Republic of Congo, Somalia, Yemen, and sixteen other active conflict zones account for the remainder.",
        onStart: () => {
          ui.updateChyron("WORLDWIDE", "16 Further Active Conflict Zones");
          ui.flyTo(10, 60, 3);
          ui.highlightCountries(["Myanmar", "Congo", "Somalia", "Yemen", "Ethiopia",
            "Mali", "Burkina Faso", "Nigeria", "Iraq", "Syria", "Haiti", "Colombia",
            "Mozambique", "Pakistan", "Cameroon", "Lebanon", "Libya", "Mexico"]);
        }
      },
      {
        text: `The total for this week: four thousand, one hundred and forty dead.`,
        onStart: () => {
          ui.updateChyron("THIS WEEK", "4,140 People Killed Across 20 Conflict Zones");
          ui.addStatCard("Global Total", "All Conflict Zones", 4140, "killed this week", "#c0392b");
          ui.flyWide();
          ui.clearHighlight();
        }
      },
      {
        text: "The interactive map follows. Every dot is a conflict. Every number is a person.",
        onStart: () => ui.updateChyron("EXPLORE", "Interactive Map \u2014 Click Any Zone For Details")
      },
      {
        text: timeFarewell(),
        onStart: null
      }
    ];
  },

  // ─── TICKER DATA ────────────────────────────────────────────────────────

  getTickerItems() {
    return [...this.conflicts]
      .sort((a, b) => b.killed - a.killed)
      .map(c => `${c.name.toUpperCase()} \u00b7 ${c.killed.toLocaleString()} KILLED`);
  },

  // ─── EXPLORE PHASE (interactive map) ────────────────────────────────────

  buildExploreHTML() {
    return `
      <div class="map-topbar">
        <div class="map-masthead">
          <a href="home.html" class="map-dnn-link">DNN</a>
          <div class="map-logo">Lead Weather</div>
          <div class="map-edition">${this.editionDate} \u00b7 Issue 001</div>
        </div>
        <div class="map-stats">
          <div class="mstat">
            <div class="mstat-n red-n" id="m-dead">\u2014</div>
            <span class="mstat-l">Killed this week</span>
          </div>
          <div class="mstat">
            <div class="mstat-n amber-n" id="m-events">\u2014</div>
            <span class="mstat-l">Conflict events</span>
          </div>
          <div class="mstat">
            <div class="mstat-n yellow-n" id="m-zones">\u2014</div>
            <span class="mstat-l">Active zones</span>
          </div>
        </div>
      </div>

      <div id="map" style="flex:1;background:#0a0e14;"></div>

      <div class="map-footer">
        <div class="legend">
          <div class="leg-item">
            <div class="leg-dot" style="width:14px;height:14px;background:rgba(192,57,43,0.88)"></div>500+ killed
          </div>
          <div class="leg-item">
            <div class="leg-dot" style="width:11px;height:11px;background:rgba(211,84,0,0.85)"></div>100\u2013499
          </div>
          <div class="leg-item">
            <div class="leg-dot" style="width:9px;height:9px;background:rgba(232,160,16,0.82)"></div>10\u201399
          </div>
          <div class="leg-item">
            <div class="leg-dot" style="width:7px;height:7px;background:rgba(180,180,180,0.55)"></div>Under 10
          </div>
        </div>
        <div class="src-note">Source: ACLED \u00b7 Estimated figures \u00b7 Prototype using representative data</div>
      </div>
    `;
  },

  initMap() {
    const conflicts = this.conflicts;

    function getColor(k) {
      if (k >= 500) return 'rgba(192,57,43,0.88)';
      if (k >= 100) return 'rgba(211,84,0,0.85)';
      if (k >= 10)  return 'rgba(232,160,16,0.82)';
      return 'rgba(170,170,170,0.55)';
    }

    function getSize(k) {
      if (k >= 500) return 28;
      if (k >= 100) return 20;
      if (k >= 10)  return 14;
      return 9;
    }

    const map = L.map('map', {
      center: [20, 15], zoom: 2.3,
      minZoom: 2, maxZoom: 8,
      zoomControl: true, attributionControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '\u00a9 CARTO', subdomains: 'abcd'
    }).addTo(map);

    conflicts.forEach((c, i) => {
      const sz = getSize(c.killed);
      const col = getColor(c.killed);

      const icon = L.divIcon({
        className: '',
        html: `<div class="conflict-marker" style="
          width:${sz}px; height:${sz}px; background:${col};
          box-shadow:0 0 ${sz}px ${col},0 0 ${sz*2}px ${col.replace(/[\d.]+\)$/, '0.25)')};
          animation-delay:${i * 0.055}s;
        "></div>`,
        iconSize: [sz, sz], iconAnchor: [sz/2, sz/2]
      });

      const kCol = c.killed >= 500 ? '#c0392b' : c.killed >= 100 ? '#d35400' : '#e8a010';

      const popup = L.popup({ className: 'conflict-popup' }).setContent(`
        <div class="popup-inner">
          <div class="p-region">${c.region} \u00b7 ${c.type}</div>
          <div class="p-name">${c.name}</div>
          <div class="p-div"></div>
          <div class="p-row">
            <span class="p-key">Killed</span>
            <span class="p-val" style="color:${kCol}">${c.killed.toLocaleString()}</span>
          </div>
          <div class="p-row">
            <span class="p-key">Events</span>
            <span class="p-val" style="color:#d35400">${c.events.toLocaleString()}</span>
          </div>
          <div class="p-note">${c.note}</div>
        </div>
      `);

      L.marker([c.lat, c.lng], { icon }).addTo(map).bindPopup(popup);
    });

    // Animate totals
    function animN(el, target, dur) {
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(e * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    setTimeout(() => {
      animN(document.getElementById('m-dead'), this.totalKilled, 1200);
      animN(document.getElementById('m-events'), this.totalEvents, 1000);
      animN(document.getElementById('m-zones'), conflicts.length, 600);
    }, 300);
  }
};
