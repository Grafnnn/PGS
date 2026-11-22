window.ATLAS_PROGRESS_PLAN = {
  "schema": 1,
  "plan_id": "goluboe-vodovod-plan",
  "rev": 1,
  "status": "draft",
  "basis": "Черновик Атласа по ТКР и ПОС 19/26-2026. По ПОС расчётная продолжительность 3,8 месяца, в том числе подготовительный период 0,5 месяца. Рабочий календарь и исполнительный журнал не представлены.",
  "stages": [
    {
      "id": "prep",
      "n": 10,
      "title": "Подготовка трассы",
      "rd": "19/26-2026-ПОС",
      "after": [],
      "ids": []
    },
    {
      "id": "earthworks",
      "n": 20,
      "title": "Котлованы и траншеи",
      "rd": "19/26-2026-ПОС",
      "after": [
        "prep"
      ],
      "ids": []
    },
    {
      "id": "hdd",
      "n": 30,
      "title": "Прокладка ГНБ",
      "rd": "19/26-2026-ТКР",
      "after": [
        "earthworks"
      ],
      "ids": [
        "NET-V-PIPE-HDD-1",
        "NET-V-CASING-HDD-1",
        "NET-V-SEAL-HDD-1-A",
        "NET-V-SEAL-HDD-1-B",
        "NET-V-PIPE-HDD-2",
        "NET-V-CASING-HDD-2",
        "NET-V-SEAL-HDD-2-A",
        "NET-V-SEAL-HDD-2-B"
      ],
      "order": "ids",
      "lots": [
        {
          "id": "hdd-1",
          "title": "Прокол № 1 · ПК0+07–ПК0+31",
          "ids": [
            "NET-V-PIPE-HDD-1",
            "NET-V-CASING-HDD-1",
            "NET-V-SEAL-HDD-1-A",
            "NET-V-SEAL-HDD-1-B"
          ],
          "seq": 1,
          "source": "atlas_draft",
          "draft": true
        },
        {
          "id": "hdd-2",
          "title": "Прокол № 2 · ПК0+31–ПК3+90",
          "ids": [
            "NET-V-PIPE-HDD-2",
            "NET-V-CASING-HDD-2",
            "NET-V-SEAL-HDD-2-A",
            "NET-V-SEAL-HDD-2-B"
          ],
          "seq": 2,
          "source": "atlas_draft",
          "draft": true
        }
      ]
    },
    {
      "id": "open",
      "n": 40,
      "title": "Открытая прокладка",
      "rd": "19/26-2026-ТКР",
      "after": [
        "earthworks"
      ],
      "ids": [
        "NET-V-PIPE-OPEN-1",
        "NET-GOL-PD-NODE-CASING-OPEN-1",
        "NET-V-PIPE-OPEN-2",
        "NET-GOL-PD-NODE-CASING-OPEN-2"
      ],
      "order": "ids",
      "lots": [
        {
          "id": "open-1",
          "title": "Траншея № 1 · КВ-1–ПК0+07",
          "ids": [
            "NET-V-PIPE-OPEN-1",
            "NET-GOL-PD-NODE-CASING-OPEN-1"
          ],
          "seq": 1,
          "source": "atlas_draft",
          "draft": true
        },
        {
          "id": "open-2",
          "title": "Траншея № 2 · ПК3+90–точка 3 у ВЗУ",
          "ids": [
            "NET-V-PIPE-OPEN-2",
            "NET-GOL-PD-NODE-CASING-OPEN-2"
          ],
          "seq": 2,
          "source": "atlas_draft",
          "draft": true
        }
      ]
    },
    {
      "id": "nodes",
      "n": 50,
      "title": "Колодец и узлы",
      "rd": "19/26-2026-ТКР",
      "after": [
        "earthworks"
      ],
      "ids": [
        "NET-GOL-PD-NODE-KV1-BASE",
        "NET-GOL-PD-NODE-KV1-RING-01",
        "NET-GOL-PD-NODE-KV1-RING-02",
        "NET-GOL-PD-NODE-KV1-RING-03",
        "NET-GOL-PD-NODE-KV1-RING-04",
        "NET-GOL-PD-NODE-KV1-RING-05",
        "NET-GOL-PD-NODE-KV1-TOP-SLAB",
        "NET-GOL-PD-NODE-KV1-COLLAR",
        "NET-GOL-PD-NODE-KV1-HATCH",
        "NET-V-BEND-UP-1",
        "NET-V-BEND-UP-2",
        "NET-V-SUPPORT-UP-2"
      ],
      "order": "ids",
      "lots": [
        {
          "id": "kv1",
          "title": "Колодец КВ-1",
          "ids": [
            "NET-GOL-PD-NODE-KV1-BASE",
            "NET-GOL-PD-NODE-KV1-RING-01",
            "NET-GOL-PD-NODE-KV1-RING-02",
            "NET-GOL-PD-NODE-KV1-RING-03",
            "NET-GOL-PD-NODE-KV1-RING-04",
            "NET-GOL-PD-NODE-KV1-RING-05",
            "NET-GOL-PD-NODE-KV1-TOP-SLAB",
            "NET-GOL-PD-NODE-KV1-COLLAR",
            "NET-GOL-PD-NODE-KV1-HATCH"
          ],
          "seq": 1,
          "source": "atlas_draft",
          "draft": true
        },
        {
          "id": "up1",
          "title": "Узел УП-1",
          "ids": [
            "NET-V-BEND-UP-1"
          ],
          "seq": 2,
          "source": "atlas_draft",
          "draft": true
        },
        {
          "id": "up2",
          "title": "Узел УП-2",
          "ids": [
            "NET-V-BEND-UP-2",
            "NET-V-SUPPORT-UP-2"
          ],
          "seq": 3,
          "source": "atlas_draft",
          "draft": true
        }
      ]
    },
    {
      "id": "commissioning",
      "n": 60,
      "title": "Испытания и подключение",
      "rd": "19/26-2026-ТКР",
      "after": [
        "hdd",
        "open",
        "nodes"
      ],
      "ids": []
    },
    {
      "id": "restoration",
      "n": 70,
      "title": "Восстановление территории",
      "rd": "19/26-2026-ПОС",
      "after": [
        "hdd",
        "open",
        "nodes"
      ],
      "ids": [
        "NET-GOL-PD-POS-R12-RESTORE-PLAN-3-CONCRETE",
        "NET-GOL-PD-POS-R12-RESTORE-PLAN-1-LAWN-W",
        "NET-GOL-PD-POS-R12-RESTORE-PLAN-1-LAWN-E",
        "NET-GOL-PD-POS-R12-RESTORE-PLAN-2-LAWN",
        "NET-GOL-PD-POS-R12-RESTORE-PLAN-3-LAWN"
      ],
      "order": "ids"
    }
  ]
};
