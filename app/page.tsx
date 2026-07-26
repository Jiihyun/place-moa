'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

type Cat = { id: number; name: string; color: string; emoji: string };
type Place = { id: number; title: string; cat_id: number | null; region: string; address: string; photo?: string; lat: number | null; lng: number | null; source: string; source_url: string | null; memo: string; visits: number; verdict: string | null };
type Cand = { name: string; cat_id: number | null; region: string; address?: string; photo?: string; lat: number | null; lng: number | null; checked?: boolean; memo?: string };
type Pending = { id: number; video_title: string; source: string; source_url: string | null; candidates: Cand[] };

const SRC_APP: Record<string, string> = { instagram: '인스타그램', youtube: '유튜브', naver: '네이버', tiktok: '틱톡', other: '원본 링크' };
const PHOTOS: Record<string, string[]> = {
  '맛집': ['1504674900247-0877df9cc836', '1517248135467-4c7edcad34c4', '1552566626-52f8b828add9', '1555939594-58d7cb561ad1', '1476224203421-9ac39bcb3327'],
  '카페': ['1495474472287-4d71bcdd2085', '1501339847302-ac426a4a7cbb', '1445116572660-236099ec97a0', '1509042239860-f550ce710b93'],
  '술집·바': ['1436076863939-06870fe779c2', '1514362545857-3bc16c4c7d1b', '1541557435984-1c79685a082b'],
  '기타': ['1414235077428-338989a2e8c0', '1466978913421-dad2ebd01d17'],
};
function hashNum(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

export default function App() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [pendings, setPendings] = useState<Pending[]>([]);
  const [tab, setTab] = useState<'map' | 'list' | 'inbox' | 'set'>('map');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState(0);
  const [filterRegion, setFilterRegion] = useState('');
  const [onlyUnvisited, setOnlyUnvisited] = useState(false);
  const [onlyAgain, setOnlyAgain] = useState(false);
  const [overlay, setOverlay] = useState<null | { kind: 'add' } | { kind: 'region' } | { kind: 'mapchooser'; id: number } | { kind: 'sharecompose' } | { kind: 'sharedone'; url: string; n: number }>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [shareTitle, setShareTitle] = useState('');
  const [shareName, setShareName] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addMemo, setAddMemo] = useState('');
  const [addCaption, setAddCaption] = useState('');
  const [addErr, setAddErr] = useState('');
  const [banner, setBanner] = useState<null | { name: string; near: Place[] }>(null);

  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const meLayerRef = useRef<any>(null);
  const markersById = useRef<Record<number, any>>({});
  const toastTimer = useRef<any>(null);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
  }, []);

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const naverPlaceUrl = (name: string) => `https://map.naver.com/p/search/${encodeURIComponent(name)}`;

  const openNaverPlace = (name: string) => {
    const webUrl = naverPlaceUrl(name);
    if (!isIOS()) {
      window.open(webUrl, '_blank');
      return;
    }

    const appUrl = `nmap://search?query=${encodeURIComponent(name)}&appname=com.jihyun.placemoa`;
    window.location.href = appUrl;
  };

  const catOf = useCallback((id: number | null) => cats.find(c => c.id === id), [cats]);
  const styleOf = useCallback((id: number | null) => {
    const c = catOf(id);
    return c ? { c: c.color, e: c.emoji, name: c.name } : { c: '#b0afab', e: '📍', name: '미분류' };
  }, [catOf]);
  const thumbURL = useCallback((p: { cat_id?: number | null; id?: number; name?: string; title?: string; photo?: string }) => {
    // 실제 네이버/릴스 사진이 있으면 프록시 경유, 없으면 카테고리 플레이스홀더
    if (p.photo) return p.photo.includes('pstatic.net') ? `/api/img?u=${encodeURIComponent(p.photo)}` : p.photo;
    const catName = catOf(p.cat_id ?? null)?.name || '기타';
    const pool = PHOTOS[catName] || PHOTOS['기타'];
    const seed = p.id ?? hashNum(p.title || p.name || 'x');
    return `https://images.unsplash.com/photo-${pool[seed % pool.length]}?w=200&h=200&fit=crop&q=60`;
  }, [catOf]);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/bootstrap');
    const j = await r.json();
    setCats(j.cats); setPlaces(j.places);
    setPendings(j.pendings.map((p: Pending) => ({ ...p, candidates: p.candidates.map(c => ({ ...c, checked: true, memo: c.memo || '' })) })));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // 북마클릿 팝업에서 저장 → 이 탭으로 돌아오면 자동 새로고침 + ?to=inbox 딥링크
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('to') === 'inbox') setTab('inbox');
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh]);

  /* ---------- map ---------- */
  useEffect(() => {
    let dead = false;
    (async () => {
      if (mapRef.current) return;
      const L = (await import('leaflet')).default;
      if (dead) return;
      LRef.current = L;
      const m = L.map('map', { zoomControl: true }).setView([37.53, 127.0], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      markerLayerRef.current = L.layerGroup().addTo(m);
      meLayerRef.current = L.layerGroup().addTo(m);
      mapRef.current = m;
      setTimeout(() => m.invalidateSize(), 200);
    })();
    return () => { dead = true; };
  }, []);

  const refreshMarkers = useCallback(() => {
    const L = LRef.current, layer = markerLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers(); markersById.current = {};
    for (const p of places) {
      if (p.lat == null || p.lng == null) continue;
      const st = styleOf(p.cat_id);
      const badge = p.verdict === 'again' ? '<i class="pchk" style="background:#f5a623">★</i>' : (p.visits > 0 ? '<i class="pchk">✓</i>' : '');
      const icon = L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26], html: `<div class="pin${p.verdict === 'meh' ? ' vis' : ''}" style="background:${st.c}"><span>${st.e}</span>${badge}</div>` });
      const mk = L.marker([p.lat, p.lng], { icon }).addTo(layer);
      const el = document.createElement('div');
      const vtag = p.verdict === 'again' ? ' · ⭐또간집' : (p.visits > 0 ? ` · ${p.visits}번 방문` : '');
      el.innerHTML = `<div style="width:188px">
        <img src="${thumbURL(p)}" style="width:100%;height:108px;object-fit:cover;border-radius:8px;display:block;margin-bottom:7px;background:#eee">
        <b style="font-size:13px">${p.title}</b><br>
        <span style="color:#6a6a6a;font-size:12px">${st.name} · ${p.region}${vtag}</span><br>
        <a href="#" style="color:#ff385c;font-size:12px">상세 보기 →</a></div>`;
      el.querySelector('a')!.addEventListener('click', (e) => { e.preventDefault(); setDetailId(p.id); });
      mk.bindPopup(el);
      markersById.current[p.id] = mk;
    }
  }, [places, styleOf]);
  useEffect(() => { refreshMarkers(); }, [refreshMarkers]);
  useEffect(() => { if (tab === 'map' && mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 60); }, [tab]);

  const fitAll = useCallback(() => {
    const L = LRef.current, m = mapRef.current;
    const pts = places.filter(p => p.lat != null).map(p => [p.lat, p.lng]);
    if (L && m && pts.length) m.fitBounds(L.latLngBounds(pts as any).pad(0.3));
  }, [places]);
  const didFit = useRef(false);
  useEffect(() => { if (!didFit.current && places.length && mapRef.current) { didFit.current = true; setTimeout(fitAll, 300); } }, [places, fitAll]);

  const showOnMap = (id: number) => {
    const p = places.find(x => x.id === id);
    if (!p || p.lat == null) { toast('좌표가 없는 장소예요'); return; }
    setDetailId(null); setTab('map');
    setTimeout(() => { mapRef.current?.setView([p.lat, p.lng], 16); markersById.current[id]?.openPopup(); }, 140);
  };

  const locateMe = () => {
    if (!navigator.geolocation) { toast('이 브라우저는 위치를 지원하지 않아요'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      const L = LRef.current, m = mapRef.current;
      if (!L || !m) return;
      meLayerRef.current.clearLayers();
      L.circle([lat, lng], { radius: 900, color: '#2b7fff', weight: 1, fillColor: '#2b7fff', fillOpacity: .1 }).addTo(meLayerRef.current);
      L.marker([lat, lng], { icon: L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="meloc"></div>' }) }).addTo(meLayerRef.current);
      m.setView([lat, lng], 15);
      const dist = (a: number, b: number, c: number, d: number) => { const r = Math.PI / 180, R = 6371000; const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
      const near = places.filter(p => p.lat != null && dist(p.lat!, p.lng!, lat, lng) <= 900)
        .sort((a, b) => dist(a.lat!, a.lng!, lat, lng) - dist(b.lat!, b.lng!, lat, lng));
      if (near.length) { setBanner({ name: '내 주변', near }); markersById.current[near[0].id]?.openPopup(); }
      else { setBanner(null); toast('근처에 저장한 곳이 없어요'); }
    }, () => toast('위치 권한이 필요해요'));
  };

  /* ---------- place actions ---------- */
  const patchPlace = async (id: number, body: any) => {
    const r = await fetch(`/api/places/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    setPlaces(ps => ps.map(p => p.id === id ? j.place : p));
  };
  const delPlace = async (id: number) => {
    await fetch(`/api/places/${id}`, { method: 'DELETE' });
    setPlaces(ps => ps.filter(p => p.id !== id));
    setDetailId(null); toast('삭제됨');
  };

  /* ---------- ingest ---------- */
  const ingestUrl = async (url: string, opts: { memo?: string; caption?: string; forcePending?: boolean; fromShare?: boolean } = {}) => {
    if (!url.trim()) { toast('링크를 붙여넣어 주세요'); return; }
    setIngesting(true); setAddErr('');
    try {
      const r = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          memo: opts.memo ?? addMemo,
          caption: opts.caption ?? addCaption,
          forcePending: opts.forcePending,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setAddErr(j.error || '분석에 실패했어요'); return; }
      setOverlay(null); setAddUrl(''); setAddMemo(''); setAddCaption(''); setAddErr('');
      if (j.saved) {
        setPlaces(ps => [j.saved, ...ps]);
        toast(`'${j.saved.title}' 저장됨 — 1곳을 찾았어요${j.usedAI ? '' : ' (데모 추출)'}`);
        setTab('map');
        if (j.saved.lat != null) setTimeout(() => { mapRef.current?.setView([j.saved.lat, j.saved.lng], 16); }, 300);
      } else if (j.pending) {
        setPendings(pd => [...pd, { ...j.pending, candidates: j.pending.candidates.map((c: Cand) => ({ ...c, checked: true, memo: c.memo || '' })) }]);
        toast(`${opts.fromShare ? '공유한 링크에서 ' : ''}장소 ${j.pending.candidates.length}곳 찾음 — 대기함에서 골라 저장하세요${j.usedAI ? '' : ' (데모 추출)'}`);
        setTab('inbox');
      }
    } finally { setIngesting(false); }
  };

  const submitIngest = async () => {
    await ingestUrl(addUrl);
  };

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const sharedUrl = p.get('iosShareUrl');
    if (!sharedUrl) return;

    const decoded = decodeURIComponent(sharedUrl);
    history.replaceState(null, '', location.pathname);
    setTab('inbox');
    toast('공유한 링크를 분석할게요');
    ingestUrl(decoded, { forcePending: true, fromShare: true });
  }, []);

  /* ---------- inbox ---------- */
  const readyCount = pendings.reduce((s, p) => s + p.candidates.length, 0);
  const checkedCount = pendings.reduce((s, p) => s + p.candidates.filter(c => c.checked).length, 0);
  const mutateCand = (pid: number, i: number, fn: (c: Cand) => Cand) =>
    setPendings(pd => pd.map(p => p.id !== pid ? p : { ...p, candidates: p.candidates.map((c, j) => j === i ? fn(c) : c) }));
  const cycleCat = (c: Cand): Cand => {
    if (!cats.length) return c;
    const k = cats.findIndex(x => x.id === c.cat_id);
    return { ...c, cat_id: cats[(k + 1) % cats.length].id };
  };
  const confirmAll = async () => {
    let added = 0;
    for (const p of pendings) {
      const chosen = p.candidates.filter(c => c.checked);
      await fetch(`/api/pendings/${p.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chosen }) });
      added += chosen.length;
    }
    await refresh();
    toast(added ? `${added}곳 저장됨 — 지도에 핀이 추가됐어요` : '저장할 곳이 없었어요');
    if (added) setTab('map');
  };

  /* ---------- share ---------- */
  const createBundle = async () => {
    const r = await fetch('/api/bundles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: shareTitle, sender: shareName, placeIds: selected }) });
    const j = await r.json();
    const abs = `${location.origin}${j.url}`;
    setOverlay({ kind: 'sharedone', url: abs, n: selected.length });
    setSelectMode(false); setSelected([]);
  };

  /* ---------- derived ---------- */
  const regions = [...new Set(places.map(p => p.region))];
  const listArr = places.filter(p =>
    (!filterCat || p.cat_id === filterCat) &&
    (!filterRegion || p.region === filterRegion) &&
    (!onlyUnvisited || p.visits === 0) &&
    (!onlyAgain || p.verdict === 'again') &&
    (!q || (p.title + p.memo).toLowerCase().includes(q.toLowerCase()))
  );
  const detail = detailId != null ? places.find(p => p.id === detailId) : null;

  /* ---------- render ---------- */
  return (
    <div id="app">
      <div id="screen">
        {/* MAP */}
        <div className={`panel ${tab === 'map' ? 'on' : ''}`} id="p-map">
          {banner && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6 }}>
              <div className="banner" onClick={() => { setDetailId(banner.near[0].id); }}>
                <i className="ti ti-map-pin-filled" style={{ fontSize: 22, color: 'var(--primary)' }} />
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 14 }}>지금 {banner.name}이에요</b><br />
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>저장한 곳 {banner.near.length}곳 — {banner.near[0].title}{banner.near.length > 1 ? ` 외 ${banner.near.length - 1}곳` : ''}</span>
                </div>
                <i className="ti ti-x" style={{ fontSize: 18, color: 'var(--text3)' }} onClick={e => { e.stopPropagation(); setBanner(null); }} />
              </div>
            </div>
          )}
          <div id="map" />
          <button onClick={locateMe} style={{ position: 'absolute', right: 16, bottom: 88, zIndex: 1001, width: 44, height: 44, borderRadius: '50%', padding: 0, boxShadow: 'var(--shadow)' }}>
            <i className="ti ti-current-location" style={{ fontSize: 20, color: '#2b7fff' }} />
          </button>
        </div>

        {/* LIST */}
        <div className={`panel scroll ${tab === 'list' ? 'on' : ''}`}>
          <div className="hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{selectMode ? (selected.length ? `${selected.length}곳 선택됨` : '장소 선택') : '저장한 장소'}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--primary)', cursor: 'pointer' }}
              onClick={() => { setSelectMode(!selectMode); setSelected([]); }}>
              {selectMode ? '취소' : <><i className="ti ti-check" style={{ fontSize: 15 }} /> 선택·공유</>}
            </span>
          </div>
          {!selectMode && <>
            <div style={{ padding: '0 14px 8px' }}>
              <input placeholder="이름·메모 검색" value={q} onChange={e => setQ(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 14px 8px' }}>
              <span className={`chip ${filterCat === 0 ? 'chipon' : ''}`} onClick={() => setFilterCat(0)}>전체</span>
              {cats.map(c => <span key={c.id} className={`chip ${filterCat === c.id ? 'chipon' : ''}`} onClick={() => setFilterCat(c.id)}>{c.name}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 14px 10px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              <button onClick={() => setOverlay({ kind: 'region' })} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 13px', borderColor: filterRegion ? 'var(--ink)' : 'var(--border)', fontWeight: filterRegion ? 600 : 400, flexShrink: 0 }}>
                <i className="ti ti-map-pin-filled" style={{ fontSize: 14, color: 'var(--primary)' }} /> {filterRegion || '전체 지역'} <i className="ti ti-chevron-down" style={{ fontSize: 14, color: 'var(--text2)' }} />
              </button>
              <span className={`chip ${onlyUnvisited ? 'chipon' : ''}`} onClick={() => { setOnlyUnvisited(!onlyUnvisited); setOnlyAgain(false); }}><i className="ti ti-flag" style={{ fontSize: 12 }} /> 안 가본 곳만</span>
              <span className={`chip ${onlyAgain ? 'chipon' : ''}`} onClick={() => { setOnlyAgain(!onlyAgain); setOnlyUnvisited(false); }}>⭐ 또간집</span>
            </div>
          </>}
          {selectMode && <p style={{ margin: 0, padding: '0 16px 10px', fontSize: 13, color: 'var(--text2)' }}>함께 공유할 장소를 골라주세요</p>}
          {(selectMode ? places : listArr).map(p => {
            const st = styleOf(p.cat_id);
            const on = selected.includes(p.id);
            return (
              <div key={p.id} className="row" onClick={() => selectMode ? setSelected(s => on ? s.filter(x => x !== p.id) : [...s, p.id]) : setDetailId(p.id)}>
                {selectMode && <i className={`ti ${on ? 'ti-circle-check-filled' : 'ti-circle'}`} style={{ fontSize: 23, color: on ? 'var(--primary)' : 'var(--text3)', flexShrink: 0 }} />}
                <img className="thumbimg" src={thumbURL(p)} width={48} height={48} style={{ borderRadius: 12 }} alt="" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <i className="ti ti-map-pin" style={{ fontSize: 12 }} /> {p.region} · {p.memo || SRC_APP[p.source] || p.source}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span className="cbdg">{st.name}</span>
                  {p.verdict === 'again'
                    ? <span className="vchk" style={{ color: '#c98a00' }}>⭐ 또간집</span>
                    : p.visits > 0 ? <span className="vchk">{p.visits}번 방문</span> : null}
                </div>
              </div>
            );
          })}
          {!selectMode && listArr.length === 0 && <p className="empty">조건에 맞는 장소가 없어요.</p>}
          {selectMode && (
            <div style={{ position: 'sticky', bottom: 0, borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--surface)' }}>
              <button className="pbtn" disabled={!selected.length} onClick={() => setOverlay({ kind: 'sharecompose' })}>
                {selected.length ? `${selected.length}곳 링크로 공유하기` : '장소를 선택하세요'}
              </button>
            </div>
          )}
        </div>

        {/* INBOX */}
        <div className={`panel scroll ${tab === 'inbox' ? 'on' : ''}`}>
          <div className="hdr">대기함</div>
          {pendings.length === 0 && (
            <div className="empty" style={{ paddingTop: 70 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✨</div>대기 중인 장소가 없어요<br />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>+ 버튼으로 릴스·영상 링크를 붙여넣으면 AI가 찾은 장소가 여기 올라와요</span>
            </div>
          )}
          {pendings.length > 0 && (
            <div style={{ background: '#fff5f6', padding: '12px 16px 14px' }}>
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}><i className="ti ti-sparkles" style={{ color: 'var(--primary)', fontSize: 14 }} /> 영상에서 찾은 장소</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>추가 안 할 곳만 체크 해제하세요 · 카테고리 탭으로 변경</p>
              {pendings.map(p => (
                <div key={p.id}>
                  <p style={{ margin: '12px 0 2px', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>🎬 {p.video_title}</p>
                  {p.candidates.map((c, i) => {
                    const st = styleOf(c.cat_id);
                    return (
                      <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <i className={`ti ${c.checked ? 'ti-circle-check-filled' : 'ti-circle'}`} style={{ fontSize: 22, color: c.checked ? 'var(--primary)' : 'var(--text3)', cursor: 'pointer', flexShrink: 0 }}
                            onClick={() => mutateCand(p.id, i, x => ({ ...x, checked: !x.checked }))} />
                          <img className="thumbimg" src={thumbURL(c)} width={36} height={36} style={{ borderRadius: 8, cursor: 'pointer' }} alt=""
                            onClick={() => mutateCand(p.id, i, x => ({ ...x, checked: !x.checked }))} />
                          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => mutateCand(p.id, i, x => ({ ...x, checked: !x.checked }))}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</p>
                            <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--text3)' }}><i className="ti ti-map-pin" style={{ fontSize: 10 }} /> {c.region}{c.lat == null ? ' · 좌표 못 찾음' : ''}</p>
                          </div>
                          <span className="chip" style={{ flexShrink: 0, gap: 5, fontSize: 12, padding: '5px 10px' }} onClick={() => mutateCand(p.id, i, cycleCat)}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.c, display: 'inline-block' }} />{st.name} <i className="ti ti-selector" style={{ fontSize: 12, color: 'var(--text3)' }} />
                          </span>
                        </div>
                        {c.checked && <input placeholder="메모 (선택)" value={c.memo || ''} onChange={e => mutateCand(p.id, i, x => ({ ...x, memo: e.target.value }))} style={{ width: 'calc(100% - 32px)', margin: '6px 0 0 32px', fontSize: 12, padding: '6px 9px' }} />}
                      </div>
                    );
                  })}
                </div>
              ))}
              <button className="pbtn" style={{ marginTop: 12 }} disabled={!checkedCount} onClick={confirmAll}>
                {checkedCount ? `선택한 ${checkedCount}곳 추가` : '추가할 곳을 선택하세요'}
              </button>
            </div>
          )}
        </div>

        {/* SETTINGS */}
        <div className={`panel scroll ${tab === 'set' ? 'on' : ''}`}>
          <div className="hdr">설정</div>
          <p style={{ margin: 0, padding: '0 16px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>카테고리 관리 <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(지도 핀 색·모양)</span></p>
          {cats.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: c.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }}>
                <span style={{ transform: 'rotate(45deg)', fontSize: 11 }}>{c.emoji}</span>
              </span>
              <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
              <i className="ti ti-trash" style={{ fontSize: 16, color: 'var(--text3)', cursor: 'pointer' }} onClick={async () => {
                const r = await fetch('/api/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) });
                setCats((await r.json()).cats); refresh(); toast('카테고리 삭제 — 장소는 미분류로 이동');
              }} />
            </div>
          ))}
          <NewCat onAdd={async (name) => {
            const r = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
            setCats((await r.json()).cats);
          }} />
          <p style={{ padding: '4px 16px', fontSize: 11, color: 'var(--text3)' }}>새 카테고리는 회색 📍 핀으로 표시돼요.</p>
          <BookmarkletCard onToast={toast} />
        </div>

        {/* DETAIL */}
        {detail && (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--surface)', overflowY: 'auto', zIndex: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 12px 8px' }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 20, cursor: 'pointer' }} onClick={() => setDetailId(null)} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>장소 상세</span>
            </div>
            <div style={{ margin: '4px 16px', position: 'relative', aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden' }}>
              <img src={thumbURL(detail)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', left: 10, top: 10, background: 'rgba(255,255,255,.92)', color: styleOf(detail.cat_id).c, fontSize: 12, fontWeight: 700, padding: '4px 11px', borderRadius: 999 }}>
                {styleOf(detail.cat_id).e} {styleOf(detail.cat_id).name}
              </span>
            </div>
            <div style={{ padding: '12px 16px 4px' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{detail.title}</p>
              <p style={{ margin: '5px 0 0', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 }}><i className="ti ti-map-pin" style={{ color: 'var(--primary)' }} /> {detail.address || detail.region}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text3)' }}>{SRC_APP[detail.source] || detail.source}에서 저장</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 10px 4px' }}>
              <div className="actiontile" onClick={() => detail.source_url ? window.open(detail.source_url, '_blank') : toast('원본 링크가 없어요')}>
                <div className="ic"><i className="ti ti-player-play" /></div><span style={{ fontSize: 11, color: 'var(--body)' }}>원문 보기</span>
              </div>
              <div className="actiontile" onClick={() => showOnMap(detail.id)}>
                <div className="ic"><i className="ti ti-map-2" /></div><span style={{ fontSize: 11, color: 'var(--body)' }}>내 지도</span>
              </div>
              <div className="actiontile" onClick={() => setOverlay({ kind: 'mapchooser', id: detail.id })}>
                <div className="ic"><i className="ti ti-navigation" style={{ color: 'var(--primary)' }} /></div><span style={{ fontSize: 11, color: 'var(--body)' }}>길찾기</span>
              </div>
              <div className="actiontile" onClick={() => openNaverPlace(detail.title)}>
                <div className="ic" style={{ background: '#03c75a', color: '#fff', fontWeight: 800, fontSize: 16 }}>N</div><span style={{ fontSize: 11, color: 'var(--body)' }}>리뷰</span>
              </div>
            </div>
            <div style={{ margin: '10px 16px 0', border: '1px solid var(--border)', borderRadius: 14, padding: '13px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  <i className="ti ti-walk" style={{ fontSize: 15, verticalAlign: '-2px', color: 'var(--text2)' }} /> 방문 기록 {detail.visits > 0 ? <>· <b>{detail.visits}번</b> 다녀옴</> : <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· 아직 안 가봄</span>}
                </p>
                <button style={{ fontSize: 12, padding: '7px 11px', flexShrink: 0 }} onClick={() => { patchPlace(detail.id, { visits: detail.visits + 1 }); toast(detail.visits === 0 ? '첫 방문 기록! 어땠는지 남겨보세요' : `${detail.visits + 1}번째 방문 기록!`); }}>+ 다녀왔어요</button>
              </div>
              {detail.visits > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                  <span className={`chip ${detail.verdict === 'again' ? 'chipon' : ''}`} onClick={() => patchPlace(detail.id, { verdict: detail.verdict === 'again' ? null : 'again' })}>⭐ 또간집 (또 갈래요)</span>
                  <span className={`chip ${detail.verdict === 'meh' ? 'chipon' : ''}`} onClick={() => patchPlace(detail.id, { verdict: detail.verdict === 'meh' ? null : 'meh' })}>한 번이면 충분</span>
                </div>
              )}
            </div>
            <div style={{ padding: '12px 16px 6px' }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text2)' }}>메모</p>
              <textarea defaultValue={detail.memo} style={{ width: '100%', fontSize: 13, minHeight: 52 }}
                onBlur={e => { if (e.target.value !== detail.memo) { patchPlace(detail.id, { memo: e.target.value }); toast('메모 저장됨'); } }} />
            </div>
            <div style={{ padding: '8px 16px 24px' }}>
              <button style={{ width: '100%', fontSize: 13, color: 'var(--danger)', borderColor: 'var(--danger-b)' }} onClick={() => delPlace(detail.id)}>
                <i className="ti ti-trash" /> 삭제
              </button>
            </div>
          </div>
        )}

        {/* OVERLAYS */}
        {overlay && (
          <div id="overlay">
            <div className="dim" onClick={() => !ingesting && setOverlay(null)} />
            {overlay.kind === 'add' && (
              <div className="sheet">
                <div className="grab" />
                <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 600 }}>링크로 장소 저장</p>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>릴스·쇼츠·게시물 링크를 붙여넣으면 AI가 장소를 찾아드려요</p>
                <input placeholder="https://www.instagram.com/reel/…" value={addUrl} onChange={e => setAddUrl(e.target.value)} style={{ width: '100%', fontSize: 14, marginBottom: 10 }} />
                <input placeholder="메모 (선택) — 예: 주말에 가보기, 데이트 코스" value={addMemo} onChange={e => setAddMemo(e.target.value)} style={{ width: '100%', fontSize: 14, marginBottom: 12 }} />
                {addErr && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ margin: '0 0 5px', fontSize: 12.5, color: 'var(--danger)' }}>{addErr}</p>
                    <p style={{ margin: '0 0 5px', fontSize: 12, color: 'var(--text2)' }}>게시물 캡션·설명을 붙여넣으면 정확도가 올라가요</p>
                    <textarea placeholder="캡션·설명 붙여넣기…" value={addCaption} onChange={e => setAddCaption(e.target.value)} style={{ width: '100%', fontSize: 13, minHeight: 70 }} />
                  </div>
                )}
                <button className="pbtn" disabled={ingesting} onClick={submitIngest}>
                  {ingesting ? <><i className="ti ti-loader-2 spin" /> AI가 장소를 찾는 중…</> : addErr ? '캡션 넣고 다시 분석' : '저장하고 장소 분석'}
                </button>
              </div>
            )}
            {overlay.kind === 'region' && (
              <div className="sheet">
                <div className="grab" />
                <p style={{ margin: '0 0 3px', fontSize: 18, fontWeight: 600 }}>지역 선택</p>
                <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text2)' }}>저장한 장소가 있는 동네만 보여요</p>
                <div style={{ overflowY: 'auto' }}>
                  {['', ...regions].map(r => {
                    const n = r === '' ? places.length : places.filter(p => p.region === r).length;
                    const on = filterRegion === r;
                    return (
                      <div key={r || '_all'} onClick={() => { setFilterRegion(r); setOverlay(null); }} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 6px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <i className={`ti ${on ? 'ti-map-pin-filled' : 'ti-map-pin'}`} style={{ fontSize: 18, color: on ? 'var(--primary)' : 'var(--text3)' }} />
                        <span style={{ flex: 1, fontSize: 15, fontWeight: on ? 700 : 400 }}>{r || '전체 지역'}</span>
                        <span className="cbdg">{n}곳</span>
                        {on && <i className="ti ti-check" style={{ fontSize: 18 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {overlay.kind === 'mapchooser' && (() => {
              const p = places.find(x => x.id === overlay.id)!;
              const q2 = encodeURIComponent(p.title);
              const rows = [
                ['네이버지도', '#03c75a', '#fff', 'N', isIOS() ? `nmap://search?query=${q2}&appname=com.jihyun.placemoa` : naverPlaceUrl(p.title)],
                ['카카오맵', '#fee500', '#3c1e1e', 'K', `https://map.kakao.com/link/search/${q2}`],
                ['구글 지도', '#4285f4', '#fff', 'G', `https://www.google.com/maps/search/${q2}`],
              ];
              return (
                <div className="sheet">
                  <div className="grab" />
                  <p style={{ margin: '0 0 2px', fontSize: 17, fontWeight: 600 }}>어떤 지도로 열까요?</p>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text2)' }}>쓰시는 지도 앱으로 &apos;{p.title}&apos; 길찾기</p>
                  {rows.map(([name, bg, fg, ic, url]) => (
                    <div key={name} onClick={() => { window.open(url, '_blank'); setOverlay(null); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 6px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{ic}</span>
                      <span style={{ flex: 1, fontSize: 15 }}>{name}</span><i className="ti ti-chevron-right" style={{ color: 'var(--text3)' }} />
                    </div>
                  ))}
                </div>
              );
            })()}
            {overlay.kind === 'sharecompose' && (
              <div className="sheet">
                <div className="grab" />
                <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 600 }}>{selected.length}곳을 링크로 묶기</p>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text2)' }}>제목·보내는 사람은 안 적어도 돼요</p>
                <p style={{ margin: '0 0 5px', fontSize: 12, color: 'var(--text2)' }}>제목 (선택)</p>
                <input placeholder="예: 성수 데이트 코스" value={shareTitle} onChange={e => setShareTitle(e.target.value)} style={{ width: '100%', fontSize: 14, marginBottom: 12 }} />
                <p style={{ margin: '0 0 5px', fontSize: 12, color: 'var(--text2)' }}>보내는 사람 (선택)</p>
                <input placeholder="예: 지현" value={shareName} onChange={e => setShareName(e.target.value)} style={{ width: '100%', fontSize: 14, marginBottom: 16 }} />
                <button className="pbtn" onClick={createBundle}>공유 링크 만들기</button>
              </div>
            )}
            {overlay.kind === 'sharedone' && (
              <div className="sheet">
                <div className="grab" />
                <p style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 600 }}>공유 링크가 생겼어요 🎉</p>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text2)' }}>{overlay.n}곳이 담긴 페이지 — 받는 사람은 &apos;받은 장소 저장하기&apos;로 자기 지도에 담아요</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input readOnly value={overlay.url} style={{ flex: 1, fontSize: 13 }} onFocus={e => e.target.select()} />
                  <button onClick={() => { navigator.clipboard.writeText(overlay.url); toast('링크 복사됨'); }}>복사</button>
                </div>
                <button className="pbtn" onClick={() => window.open(overlay.url, '_blank')}>미리 열어보기</button>
              </div>
            )}
          </div>
        )}

        {(tab === 'map' || tab === 'list') && !selectMode && detailId == null && (
          <button className="fab" onClick={() => setOverlay({ kind: 'add' })}>+</button>
        )}
        {toastMsg && <div className="toast">{toastMsg}</div>}
      </div>

      {/* TABBAR */}
      <div id="tabbar">
        {([['map', 'ti-map-pin', '지도'], ['list', 'ti-list', '목록'], ['inbox', 'ti-inbox', '대기함'], ['set', 'ti-settings', '설정']] as const).map(([t, ic, label]) => (
          <div key={t} className={`tb ${tab === t ? 'tbon' : ''}`} onClick={() => { setTab(t); setDetailId(null); setSelectMode(false); }}>
            <i className={`ti ${ic}`} style={{ fontSize: 20 }} />{label}
            {t === 'inbox' && readyCount > 0 && <span className="tbadge">{readyCount}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function BookmarkletCard({ onToast }: { onToast: (m: string) => void }) {
  const [origin, setOrigin] = useState('');
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => { setOrigin(location.origin); }, []);
  const code = origin
    ? `javascript:(function(){var d=document,c='',m=d.querySelector('meta[property="og:description"]');if(m)c=m.content;if(!c){var a=d.querySelector('article');if(a)c=a.innerText;}if(!c)c=d.title;window.open('${origin}/add?url='+encodeURIComponent(location.href)+'&caption='+encodeURIComponent(c.slice(0,1500)),'moa','width=440,height=700');})();`
    : '';
  useEffect(() => { if (ref.current && code) ref.current.setAttribute('href', code); }, [code]);
  return (
    <div style={{ margin: '18px 16px 30px', padding: '16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface2)' }}>
      <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>💻 노트북에서 원클릭 저장</p>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
        웹 인스타그램·유튜브 보다가 아래 버튼 한 번으로 저장하세요. 복붙이 필요 없어요.
      </p>
      <a ref={ref} className="bm" draggable onClick={e => { e.preventDefault(); onToast('이 버튼을 북마크바로 "드래그"하세요'); }}>
        📍 장소모아에 저장
      </a>
      <ol style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--body)', lineHeight: 1.7 }}>
        <li>북마크바 켜기 (크롬: <b>⌘⇧B</b>)</li>
        <li>위 <b>📍 장소모아에 저장</b> 버튼을 북마크바로 <b>드래그</b></li>
        <li>인스타에서 릴스 보다가 그 북마크 클릭 → 장소가 대기함에 쌓여요</li>
      </ol>
      <button style={{ marginTop: 12, fontSize: 12 }} onClick={() => { navigator.clipboard.writeText(code); onToast('북마클릿 코드 복사됨'); }}>
        <i className="ti ti-copy" style={{ fontSize: 13, verticalAlign: '-2px' }} /> 코드 복사 (수동 등록용)
      </button>
    </div>
  );
}

function NewCat({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
      <input placeholder="새 카테고리" value={v} onChange={e => setV(e.target.value)} style={{ flex: 1, fontSize: 13 }} />
      <button onClick={() => { if (v.trim()) { onAdd(v.trim()); setV(''); } }} style={{ fontSize: 13 }}>추가</button>
    </div>
  );
}
