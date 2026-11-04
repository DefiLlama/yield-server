const isAaveMerklOpportunityEligible = (opportunity) => {
  if (opportunity.action === 'BORROW') return true;

  const conditions = [
    opportunity.type,
    opportunity.name,
    opportunity.description,
    ...(opportunity.howToSteps || []),
    ...(opportunity.activePrograms || []).map((program) => program.name),
    ...(opportunity.aprRecord?.breakdowns || []).map(
      (breakdown) => breakdown.distributionType
    ),
  ].join(' ');

  return !/liquid[\s_-]+leverage|looping\s+required|(?:must|need\s+to|required\s+to)\s+(?:also\s+)?borrow|health\s+factor\s+(?:below|under|less\s+than|<)/i.test(
    conditions
  );
};

module.exports = { isAaveMerklOpportunityEligible };
