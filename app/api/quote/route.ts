import {getConfig} from '@/lib/config';
import {calculateQuote} from '@/lib/pricing';
import {apiError,checkOrigin} from '@/lib/security';
export async function POST(req:Request){try{checkOrigin(req);return Response.json(calculateQuote(await req.json(),await getConfig()),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
