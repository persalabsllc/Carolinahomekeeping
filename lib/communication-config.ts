import {z} from 'zod';
export const communicationSchema=z.object({
 ownerEmail:z.email().max(254).transform(s=>s.toLowerCase()),ownerAlerts:z.boolean(),reminders:z.boolean(),followups:z.boolean(),recovery:z.boolean(),
 followupHours:z.number().int().min(1).max(24),recoveryHours:z.number().int().min(1).max(72),offerDays:z.number().int().min(1).max(30),offerPercent:z.number().int().min(1).max(50),
 postalAddress:z.string().trim().max(500),reviewUrl:z.union([z.literal(''),z.url().max(1000).refine(v=>new URL(v).protocol==='https:','Use an HTTPS review link.')]),
 enabledAt:z.string().datetime({offset:true}),
});
export type CommunicationConfig=z.infer<typeof communicationSchema>;
export const communicationDefaults:CommunicationConfig={ownerEmail:'kkratoville@gmail.com',ownerAlerts:true,reminders:true,followups:true,recovery:true,followupHours:2,recoveryHours:2,offerDays:7,offerPercent:10,postalAddress:'',reviewUrl:'',enabledAt:'2026-09-20T00:00:00.000Z'};
