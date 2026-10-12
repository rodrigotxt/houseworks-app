// components/shells/nav.ts
// As secoes do app, num lugar so.
//
// Os tres shells (lateral no desktop, inferior no celular, barra grande na TV) leem
// daqui — mudar uma secao e mudar uma linha, nao tres arquivos.

import BarChartIcon from '@mui/icons-material/BarChart';
import GroupsIcon from '@mui/icons-material/Groups';
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
  { href: '/performance', label: 'Desempenho', shortLabel: 'Placar', icon: BarChartIcon },
  { href: '/household', label: 'Casa', shortLabel: 'Casa', icon: GroupsIcon },
];

/** Qual item esta ativo para um caminho. Casa por prefixo para /tasks/123 marcar Tarefas. */
export function activeItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
}
