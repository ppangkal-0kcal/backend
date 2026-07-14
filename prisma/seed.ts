import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sungsimdang = await prisma.bakery.upsert({
    where: { id: 'bak_sungsimdang' },
    update: {},
    create: {
      id: 'bak_sungsimdang',
      name: '성심당 본점',
      latitude: 36.3283,
      longitude: 127.4291,
      address: '대전 중구 대종로480번길 15',
      rating: 4.6,
      reviewCount: 21034,
      openingHours: '08:00-22:00',
    },
  });

  const mongsim = await prisma.bakery.upsert({
    where: { id: 'bak_mongsim' },
    update: {},
    create: {
      id: 'bak_mongsim',
      name: '몽심',
      latitude: 36.3504,
      longitude: 127.3845,
      address: '대전 유성구',
      rating: 4.4,
      reviewCount: 892,
      openingHours: '10:00-21:00',
    },
  });

  // source_grade: ppangkal.md §2.2에서 직접 조사·정제해 확보한 가격/칼로리 데이터이므로 'B'.
  // 영양 성분(carb_g/protein_g/fat_g/base_weight_g)은 아직 확보되지 않아 NULL로 둔다 — 임의로
  // 지어내지 않는다.
  const SOURCE_NOTE = 'ppangkal.md 최종판 §2.2 자체 조사 데이터';

  const sungsimdangItems = [
    { name: '튀김소보로', category: '빵', price: 2200, calories: 343 },
    { name: '명란바게트', category: '빵', price: 4500, calories: 320 },
    { name: '부추빵', category: '빵', price: 2000, calories: 250 },
    { name: '보문산메아리', category: '빵', price: 3200, calories: 400 },
    { name: '소보로빵', category: '빵', price: 1800, calories: 290 },
    { name: '레몬마들렌', category: '디저트', price: 2500, calories: 180 },
  ].map((item) => ({ ...item, sourceGrade: 'B', sourceNote: SOURCE_NOTE }));

  const mongsimItems = [
    { name: '밀키연유 마들렌', category: '디저트', price: 2500, calories: 180 },
    { name: '바닐라 까눌레', category: '디저트', price: 3000, calories: 220 },
    { name: '크루아상', category: '빵', price: 3500, calories: 270 },
  ].map((item) => ({ ...item, sourceGrade: 'B', sourceNote: SOURCE_NOTE }));

  for (const item of sungsimdangItems) {
    await prisma.breadItem.upsert({
      where: { id: `itm_${sungsimdang.id}_${item.name}` },
      update: {},
      create: { id: `itm_${sungsimdang.id}_${item.name}`, bakeryId: sungsimdang.id, ...item },
    });
  }

  for (const item of mongsimItems) {
    await prisma.breadItem.upsert({
      where: { id: `itm_${mongsim.id}_${item.name}` },
      update: {},
      create: { id: `itm_${mongsim.id}_${item.name}`, bakeryId: mongsim.id, ...item },
    });
  }

  console.log('Seed complete: 2 bakeries, 9 bread items.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
