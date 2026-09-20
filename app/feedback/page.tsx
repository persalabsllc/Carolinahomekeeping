import {FeedbackForm} from '@/components/feedback-form';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Your cleaning feedback',robots:{index:false,follow:false}};
export default function Page(){return <FeedbackForm/>;}
