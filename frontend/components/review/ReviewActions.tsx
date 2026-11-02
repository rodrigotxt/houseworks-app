// components/review/ReviewActions.tsx
// O botão "Avaliar" e o diálogo de nota (1–5) + comentário.
//
// A nota é OBRIGATÓRIA (a API exige), então o envio fica desabilitado até alguém
// escolher. O padrão não é 5 de propósito: um clique apressado não deve dar nota máxima.
//
// "Avaliar" não altera os pontos — quem executou já os recebeu ao concluir (e eles
// passam a contar quando a execução é aprovada). A nota mede a qualidade do trabalho.

'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Rating from '@mui/material/Rating';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import RateReviewIcon from '@mui/icons-material/RateReview';

import { rateExecution } from '@/app/(app)/review/actions';
import { EMPTY_RATING_ACTION } from './actionState';

interface ReviewActionsProps {
  executionId: string;
  taskName: string;
  executedByName: string;
}

const NOTA_TEXTO: Record<number, string> = {
  1: 'Muito abaixo do esperado',
  2: 'Abaixo do esperado',
  3: 'Dentro do esperado',
  4: 'Bom',
  5: 'Excelente',
};

export default function ReviewActions({
  executionId,
  taskName,
  executedByName,
}: ReviewActionsProps) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState<number | null>(null);

  const [estado, avaliar, avaliando] = useActionState(
    rateExecution.bind(null, executionId),
    EMPTY_RATING_ACTION
  );

  // Fecha só quando a API confirma. Fechar antes esconderia "alguém já avaliou" ou
  // "a janela fechou" — mensagens que precisam ficar na tela.
  useEffect(() => {
    if (estado.status !== 'ok') return;

    setAberto(false);
    // A fila do servidor já foi invalidada; o refresh garante que o cartão avaliado
    // desapareça mesmo se o cache do roteador ainda estiver servindo a versão anterior.
    router.refresh();
  }, [estado.status, router]);

  function abrir() {
    setNota(null);
    setAberto(true);
  }

  return (
    <>
      <Button
        variant="contained"
        startIcon={<RateReviewIcon />}
        onClick={abrir}
        sx={{ flexShrink: 0 }}
      >
        Avaliar
      </Button>

      <Dialog open={aberto} onClose={() => (avaliando ? null : setAberto(false))} fullWidth maxWidth="xs">
        <form action={avaliar}>
          <DialogTitle>Avaliar “{taskName}”</DialogTitle>

          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Feito por {executedByName}. A nota é a conferência do trabalho — ela não altera os
              pontos, que já foram creditados na conclusão.
            </DialogContentText>

            <Stack spacing={1} sx={{ alignItems: 'center' }}>
              <Rating
                value={nota}
                onChange={(_evento, valor) => setNota(valor)}
                size="large"
                aria-label="Nota de 1 a 5"
              />
              <input type="hidden" name="rating" value={nota ?? ''} />

              <Typography variant="body2" color={nota ? 'text.primary' : 'text.secondary'}>
                {nota ? nota + ' — ' + NOTA_TEXTO[nota] : 'Escolha uma nota de 1 a 5'}
              </Typography>
            </Stack>

            <TextField
              name="note"
              label="Comentário (opcional)"
              placeholder="Ficou ótimo, obrigado!"
              multiline
              minRows={2}
              fullWidth
              sx={{ mt: 2 }}
            />

            {estado.status === 'error' && estado.message && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                {estado.message}
              </Alert>
            )}
          </DialogContent>

          <DialogActions>
            <Button onClick={() => setAberto(false)} disabled={avaliando}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={avaliando || nota === null}>
              {avaliando ? 'Enviando…' : 'Enviar avaliação'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
