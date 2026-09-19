import {adminUser} from '@/lib/auth';
import {getConfig,readiness} from '@/lib/config';
import {getAdminData} from '@/lib/admin-data';
import {AdminLogin} from '@/components/admin-login';
import {ControlRoom} from '@/components/control-room';
export const metadata={title:'Control Room',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function Admin(){const user=await adminUser();const ready=readiness();if(!user)return <AdminLogin configured={ready.admin&&ready.database&&ready.email}/>;return <ControlRoom user={user} data={await getAdminData()} config={await getConfig()} readiness={ready}/>;}
