// components/ui/EmptyState.tsx
// Estado vazio. Uma tela em branco parece defeito; dizer o que fazer, nao.

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Preferível a onAction quando a ação é navegar: vira um link de verdade. */
  actionHref?: string;
}

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        textAlign: 'center',
        py: 8,
        px: 3,
        border: 1,
        borderStyle: 'dashed',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {description}
        </Typography>
      )}
      {actionLabel && (actionHref || onAction) && (
        <Button variant="contained" href={actionHref} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
