import {z} from 'zod';
import {quoteSchema} from './pricing';
export const contactSchema=z.object({name:z.string().trim().min(2).max(120),email:z.email().max(254).transform(s=>s.toLowerCase().trim()),phone:z.string().trim().min(10).max(25).regex(/^[+\d\s().-]+$/)});
export const homeSchema=z.object({address:z.string().trim().min(5).max(250),city:z.string().trim().min(2).max(80),state:z.literal('NC'),access:z.string().max(2000).default(''),instructions:z.string().max(2000).default('')});
export const bookingSchema=quoteSchema.extend({contact:contactSchema,home:homeSchema,scheduledStart:z.string().datetime({offset:true}),policyAccepted:z.literal(true),policyVersion:z.literal('2026-09-19'),photoConsent:z.boolean().default(false)});
export type BookingInput=z.infer<typeof bookingSchema>;
export const leadSchema=z.object({token:z.string().min(32).max(100).optional(),type:z.enum(['residential','commercial','contact']),contact:contactSchema,stage:z.string().max(40),quote:quoteSchema.optional(),address:z.string().max(300).default(''),company:z.string().max(150).default(''),businessType:z.string().max(100).default(''),squareFeet:z.string().max(30).default(''),frequency:z.string().max(100).default(''),preferredContact:z.enum(['email','phone','text']).default('email'),notes:z.string().max(3000).default(''),website:z.string().max(300).default('')});
