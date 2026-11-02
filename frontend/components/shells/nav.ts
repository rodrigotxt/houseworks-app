// components/shells/nav.ts
// As secoes do app, num lugar so.
//
// NAV_ITEMS e a lista completa (lateral do desktop, barra grande da TV). MOBILE_NAV_ITEMS
// e o recorte da barra inferior: as telas de uso diario, sem Desempenho nem Casa — essas
// duas vivem no menu do avatar para os rotulos nao apertarem.

import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RateReviewIcon from '@mui/icons-material/RateReview';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ViewListIcon from '@mui/icons-material/ViewList';

export interface NavItem {
  href: string;
  label: string;
  /** Rotulo curto para a barra inferior, onde o espaco e apertado. */
  shortLabel: string;
  icon: typeof TaskAltIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/tasks', label: 'Tarefas', shortLabel: 'Tarefas', icon: TaskAltIcon },
  { href: '/schedule', label: 'Cronograma', shortLabel: 'Agenda', icon: ViewListIcon },
  { href: '/review', label: 'Conferir', shortLabel: 'Conferir', icon: RateReviewIcon },
  { href: '/reminders', label: 'Lembretes', shortLabel: 'Avisos', icon: NotificationsActiveIcon },
  { href: '/performance', label: 'Desempenho', shortLabel: 'Placar', icon: BarChartIcon },
  { href: '/household', label: 'Casa', shortLabel: 'Casa', icon: GroupsIcon },
];

/**
 * O que cabe na barra inferior do celular.
 *
 * Desempenho e Casa saíram dela: seis itens apertavam os rótulos e essas duas telas são
 * de consulta, não de uso diário. Elas continuam no menu do avatar, junto com trocar
 * senha e sair — e continuam na navegação lateral no desktop/tablet.
 */
export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (item) => item.href !== '/performance' && item.href !== '/household'
);

/** Qual item esta ativo para um caminho. Casa por prefixo para /tasks/123 marcar Tarefas. */
export function activeItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
}
