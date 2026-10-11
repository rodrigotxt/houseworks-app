// components/shells/AppShell.tsx
// O chrome do app: barra superior, navegacao lateral e navegacao inferior.
//
// UM componente com comportamento responsivo, e nao tres arvores separadas. O motivo e
// pratico: renderizar duas navegacoes e mostrar uma por CSS evita piscar o layout errado
// e nao cria divergencia de hidratacao. O que muda por dispositivo e densidade, nao a
// estrutura.
//
// O parametro `device` vem do servidor (user agent) e so ajusta: a TV usa tudo maior,
// porque se le a tres metros, e nao tem barra inferior.

'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import LogoutIcon from '@mui/icons-material/Logout';
import TvIcon from '@mui/icons-material/Tv';

import type { DeviceKind } from '@/lib/device/profile';
import { getBrowserApi } from '@/lib/session/browser';
import { NAV_ITEMS, activeItem } from './nav';

const SIDE_WIDTH = { desktop: 248, tv: 320 } as const;

interface AppShellProps {
  device: DeviceKind;
  householdName: string;
  userName: string;
  username: string;
  children: React.ReactNode;
}

export default function AppShell({
  device,
  householdName,
  userName,
  username,
  children,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const atual = activeItem(pathname);
  const isTv = device === 'tv';
  const larguraLateral = isTv ? SIDE_WIDTH.tv : SIDE_WIDTH.desktop;

  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await getBrowserApi().auth.logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: isTv ? 84 : undefined }}>
          <Typography
            variant={isTv ? 'h2' : 'h6'}
            component="h1"
            sx={{ flexGrow: 1, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {householdName}
          </Typography>

          <Tooltip title="Abrir o painel da TV">
            <IconButton
              size={isTv ? 'large' : 'medium'}
              href="/panel"
              aria-label="Painel da TV"
            >
              <TvIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={userName}>
            <IconButton
              size={isTv ? 'large' : 'medium'}
              onClick={(evento) => setMenu(evento.currentTarget)}
              aria-label="Sua conta"
            >
              <Avatar sx={{ width: isTv ? 44 : 32, height: isTv ? 44 : 32, bgcolor: 'primary.main' }}>
                {userName.slice(0, 1).toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{userName}</Typography>
                <Typography variant="caption" color="text.secondary">@{username}</Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={sair} disabled={saindo}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              <ListItemText>{saindo ? 'Saindo…' : 'Sair'}</ListItemText>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Navegacao lateral: aparece de md para cima. Na TV fica mais larga, para o
          controle remoto ter alvos grandes. */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          width: larguraLateral,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: larguraLateral,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
          },
        }}
      >
        <Toolbar sx={{ minHeight: isTv ? 84 : undefined }} />
        <List sx={{ px: 1, pt: 1 }}>
          {NAV_ITEMS.map((item) => {
            const Icone = item.icon;
            const selecionado = atual?.href === item.href;

            return (
              <ListItem key={item.href} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={selecionado}
                  onClick={() => router.push(item.href)}
                  aria-current={selecionado ? 'page' : undefined}
                  sx={{ py: isTv ? 2 : 1 }}
                >
                  <ListItemIcon sx={{ minWidth: isTv ? 56 : 40 }}>
                    <Icone fontSize={isTv ? 'large' : 'medium'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { fontSize: isTv ? '1.25rem' : undefined } }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          // Espaco para a barra inferior no celular; no desktop ela nao existe.
          pb: { xs: 9, md: 0 },
        }}
      >
        <Toolbar sx={{ minHeight: isTv ? 84 : undefined }} />
        {children}
      </Box>

      {/* Navegacao inferior: so no celular. A TV nunca mostra. */}
      {!isTv && (
        <Paper
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            display: { xs: 'block', md: 'none' },
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <BottomNavigation
            showLabels
            value={atual?.href ?? false}
            onChange={(_evento, valor) => router.push(String(valor))}
          >
            {NAV_ITEMS.map((item) => {
              const Icone = item.icon;
              return (
                <BottomNavigationAction
                  key={item.href}
                  value={item.href}
                  label={item.shortLabel}
                  icon={<Icone />}
                />
              );
            })}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}
