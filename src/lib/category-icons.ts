import { Building2, ShoppingBag, BarChart3, ClipboardCheck, Braces } from 'lucide-react';
import type { TaskCategory } from '@/lib/training-tasks';

export const CATEGORY_ICONS: Record<TaskCategory, typeof Building2> = {
  company: Building2,
  shop: ShoppingBag,
  analytics: BarChart3,
  exam: ClipboardCheck,
  json: Braces,
};
