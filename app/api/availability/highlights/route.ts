import {getHomeAvailability} from '@/lib/home-availability';
export const dynamic='force-dynamic';

export async function GET(){
  const result=await getHomeAvailability();
  return Response.json(result,{status:result.status==='unavailable'?503:200,headers:{'Cache-Control':'no-store'}});
}
