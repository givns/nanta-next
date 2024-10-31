// Add initial commission tiers data
// You can use this in a seed file or migration
// prisma/seed.ts example:
/*
await prisma.commissionTier.createMany({
  data: [
    {
      minAmount: 7000000,
      maxAmount: 7500000,
      percentage: 0.5
    },
    {
      minAmount: 7500000,
      maxAmount: 8000000,
      percentage: 0.25
    },
    {
      minAmount: 8000000,
      maxAmount: null, // unlimited
      percentage: 0.35
    }
  ]
});

await prisma.commissionBonus.createMany({
  data: [
    {
      type: 'quarterly',
      targetAmount: 8000000,
      requiredMonths: 3,
      bonusAmount: 3000
    },
    {
      type: 'yearly',
      targetAmount: 9000000,
      requiredMonths: 4,
      bonusAmount: 10000
    }
  ]
});
*/
