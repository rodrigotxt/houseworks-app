// components/ui/SubmitButton.tsx
// Botão de envio que sabe que está enviando.
//
// O estado vem do useActionState do formulário; sem isto o usuário clica duas vezes
// porque nada aconteceu na tela.

'use client';

import Button, { type ButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

interface SubmitButtonProps extends Omit<ButtonProps, 'type'> {
  pending: boolean;
  label: string;
  pendingLabel?: string;
}

export default function SubmitButton({
  pending,
  label,
  pendingLabel = 'Salvando…',
  ...resto
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      variant="contained"
      disabled={pending}
      startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
      {...resto}
    >
      {pending ? pendingLabel : label}
    </Button>
  );
}
