// components/reminders/PushToggle.tsx
// Liga/desliga o push NESTE aparelho.
//
// O push é por aparelho, não por conta: o mesmo usuário pode ter o celular e o
// computador inscritos, e desligar num não desliga no outro. Por isso o texto fala em
// "neste aparelho", e não em "minhas notificações".

'use client';

import { useEffect, useState } from 'react';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';

import { getBrowserApi } from '@/lib/session/browser';
import {
  currentPushState,
  disablePush,
  enablePush,
  PushError,
  type PushState,
} from '@/lib/device/push';

interface PushToggleProps {
  /** O servidor tem VAPID configurado? (GET /me/push/config) */
  pushEnabled: boolean;
}

export default function PushToggle({ pushEnabled }: PushToggleProps) {
  const [estado, setEstado] = useState<PushState | 'loading'>('loading');
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!pushEnabled) {
      setEstado('unsupported');
      return;
    }

    let ativo = true;

    currentPushState()
      .then((valor) => {
        if (ativo) setEstado(valor);
      })
      .catch(() => {
        if (ativo) setEstado('unsupported');
      });

    return () => {
      ativo = false;
    };
  }, [pushEnabled]);

  async function ativar() {
    setOcupado(true);
    setMensagem(null);

    try {
      await enablePush(getBrowserApi());
      setEstado('subscribed');
    } catch (erro) {
      if (erro instanceof PushError) {
        setMensagem(erro.message);
        if (erro.code === 'denied') setEstado('denied');
        if (erro.code === 'needs-install') setEstado('needs-install');
      } else {
        setMensagem('Não foi possível ativar as notificações neste aparelho.');
      }
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    setMensagem(null);

    try {
      await disablePush(getBrowserApi());
      setEstado('available');
    } catch {
      setMensagem('Não foi possível desativar as notificações neste aparelho.');
    } finally {
      setOcupado(false);
    }
  }

  const ativo = estado === 'subscribed';

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
          <NotificationsActiveIcon color={ativo ? 'primary' : 'disabled'} />

          <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
            <Typography variant="h6" component="h3" sx={{ fontSize: '1rem' }}>
              Notificações neste aparelho
            </Typography>

            {estado === 'loading' && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">
                  Verificando…
                </Typography>
              </Stack>
            )}

            {estado === 'available' && (
              <Typography variant="body2" color="text.secondary">
                Receba os lembretes mesmo com o app fechado. O navegador vai pedir permissão.
              </Typography>
            )}

            {estado === 'subscribed' && (
              <Typography variant="body2" color="text.secondary">
                Ativas. Este aparelho recebe os lembretes por push.
              </Typography>
            )}

            {estado === 'denied' && (
              <Typography variant="body2" color="warning.main">
                A permissão foi negada. Libere as notificações nas configurações do navegador
                e tente de novo.
              </Typography>
            )}

            {estado === 'needs-install' && (
              <Typography variant="body2" color="text.secondary">
                No iPhone, instale este app na Tela de Início (Compartilhar → Adicionar à Tela
                de Início) para receber notificações.
              </Typography>
            )}

            {estado === 'unsupported' && pushEnabled && (
              <Typography variant="body2" color="text.secondary">
                Este navegador não recebe notificações push. Os lembretes continuam aparecendo
                na caixa de notificações do app.
              </Typography>
            )}

            {!pushEnabled && (
              <Typography variant="body2" color="text.secondary">
                O servidor ainda não tem as chaves de push (VAPID). Os lembretes continuam
                aparecendo na caixa de notificações do app.
              </Typography>
            )}

            {mensagem && <Alert severity="warning" sx={{ mt: 1 }}>{mensagem}</Alert>}
          </Stack>

          {pushEnabled && estado === 'available' && (
            <Button
              variant="contained"
              startIcon={<NotificationsActiveIcon />}
              onClick={ativar}
              disabled={ocupado}
            >
              Ativar
            </Button>
          )}

          {pushEnabled && estado === 'subscribed' && (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<NotificationsOffIcon />}
              onClick={desativar}
              disabled={ocupado}
            >
              Desativar
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
