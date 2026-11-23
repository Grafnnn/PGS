// Голубое R1.2. Метры в мировых координатах Атласа, начало XY — колодец КВ‑1.
// План оцифрован по ТКР, л. 2–3, и сверен с центрами колец NET-V-PIPE, ось трубы = лоток + 0,0991 м.
// Отметки лотка и три отметки земли взяты из ППО, л. 5. approx обозначает пикет, снятый по графику.
// Между опорами отметки лотка интерполируются. Отметки основания КВ‑1 сняты из мешей R1.2.
window.ATLAS_PROFILE_WORLD = {
  pipe: {outerDiameterMm: 225, wallMm: 13.4, source: {sourceId:"tkr", pdfPage:13}},
  get insideRadius() { return (this.pipe.outerDiameterMm / 2 - this.pipe.wallMm) / 1000; },
  construction: [{"startM":0,"endM":7,"method":"open","pipeId":"NET-V-PIPE-OPEN-1","casingId":"NET-GOL-PD-NODE-CASING-OPEN-1"},{"startM":7,"endM":31,"method":"hdd","pipeId":"NET-V-PIPE-HDD-1","casingId":"NET-V-CASING-HDD-1"},{"startM":31,"endM":390,"method":"hdd","pipeId":"NET-V-PIPE-HDD-2","casingId":"NET-V-CASING-HDD-2"},{"startM":390,"endM":400,"method":"open","pipeId":"NET-V-PIPE-OPEN-2","casingId":"NET-GOL-PD-NODE-CASING-OPEN-2"}],
  constructionSource: {sourceId:"tkr",pdfPage:32},
  route: [
    {"station": 0.0, "x": 0.0, "y": 0.0, "invert": 200.5},
    {"station": 7.0, "x": 6.846, "y": -0.2558387, "invert": 200.464186},
    {"station": 21.5, "x": 21.027, "y": -0.7857903, "invert": 200.39},
    {"station": 31.0, "x": 30.318, "y": -1.133, "invert": 200.42},
    {"station": 53.499398, "x": 39.646, "y": 19.507, "invert": 200.4810153},
    {"station": 60.5, "x": 42.9560977, "y": 25.7286129, "invert": 200.5},
    {"station": 72.292604, "x": 48.532, "y": 36.209, "invert": 200.7879757},
    {"station": 82.372136, "x": 52.944, "y": 45.347, "invert": 201.0341181},
    {"station": 125.316682, "x": 71.442, "y": 84.422, "invert": 202.082825},
    {"station": 142.4, "x": 79.8507224, "y": 99.4235265, "invert": 202.5},
    {"station": 152.589132, "x": 84.866, "y": 108.371, "invert": 202.7722547},
    {"station": 157.39099, "x": 87.041, "y": 112.688, "invert": 202.9005609},
    {"station": 202.789114, "x": 106.452, "y": 154.063, "invert": 204.1136036},
    {"station": 263.574243, "x": 132.576, "y": 209.398, "invert": 205.7377887},
    {"station": 285.25214, "x": 140.359, "y": 229.786, "invert": 206.3170244},
    {"station": 292.1, "x": 142.8723305, "y": 236.2052076, "invert": 206.5},
    {"station": 390.0, "x": 178.804, "y": 327.977, "invert": 207.23},
    {"station": 400.0, "x": 169.664, "y": 332.293, "invert": 207.3}
  ],
  marks: [
    {"station": 0.0, "invert": 200.5, "label": "КВ‑1", "ground": 204.3},
    {"station": 21.5, "invert": 200.39, "approx": true},
    {"station": 31.0, "invert": 200.42, "label": "УП‑1", "ground": 203.8},
    {"station": 60.5, "invert": 200.5, "approx": true},
    {"station": 142.4, "invert": 202.5, "approx": true},
    {"station": 292.1, "invert": 206.5, "approx": true},
    {"station": 390.0, "invert": 207.23, "label": "УП‑2", "ground": 211.05},
    {"station": 400.0, "invert": 207.3, "label": "Точка 3 у ВЗУ"}
  ],
  well: {"station": 0, "slabTop": 200.0, "slabBottom": 199.86, "beddingBottom": 199.76}
};
