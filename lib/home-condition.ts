export const conditionFlags = ['heavy_clutter','severe_buildup','construction','hazards'] as const;
export type ConditionFlag = typeof conditionFlags[number];
export const conditionFlagNames:Record<ConditionFlag,string> = {
  heavy_clutter:'Heavy clutter or blocked floors / surfaces',
  severe_buildup:'Heavy grease, grime or long-standing buildup',
  construction:'Renovation dust or construction debris',
  hazards:'Mold, pests, bodily waste or unsafe conditions',
};
export const conditionNames = {
  maintained:'Normally maintained',
  buildup:'Some buildup — deep cleaning needed',
  excessive:'Unusually heavy conditions — review needed',
};
export function needsConditionReview(input:{condition:string;conditionFlags?:ConditionFlag[]}){
  return input.condition==='excessive'||!!input.conditionFlags?.length;
}
