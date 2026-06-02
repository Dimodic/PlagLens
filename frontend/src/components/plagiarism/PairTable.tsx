/**
 * Sortable table of plagiarism pairs.
 */
import { ArrowLeftRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { PlagiarismPair } from '@/api/endpoints/plagiarism';
import { useTranslation } from '@/i18n';
import { SimilarityBar } from './SimilarityBar';

interface PairTableProps {
  pairs: PlagiarismPair[];
  runId: string;
}

export function PairTable({ pairs, runId }: PairTableProps) {
  const { t } = useTranslation();
  if (!pairs.length) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {t('pair_table.empty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table data-testid="plagiarism-pairs-table" className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead>{t('pair_table.student_a')}</TableHead>
            <TableHead>{t('pair_table.student_b')}</TableHead>
            <TableHead>{t('pair_table.similarity')}</TableHead>
            <TableHead>{t('pair_table.matched_tokens')}</TableHead>
            <TableHead>{t('pair_table.fragments')}</TableHead>
            <TableHead>Cross</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pairs.map((p) => (
            <TableRow key={p.id} data-testid={`pair-row-${p.id}`}>
              <TableCell data-testid={`pair-row-${p.id}-a`}>
                {p.a_author?.display_name ?? p.a_submission_id}
              </TableCell>
              <TableCell data-testid={`pair-row-${p.id}-b`}>
                {p.b_author?.display_name ?? p.b_submission_id}
              </TableCell>
              <TableCell data-testid={`pair-row-${p.id}-similarity`}>
                <SimilarityBar value={p.similarity} />
              </TableCell>
              <TableCell>{p.matched_tokens}</TableCell>
              <TableCell>{p.fragments_count}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {p.cross_course && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="secondary"
                          className="gap-1 px-1.5 py-0 text-[10px]"
                        >
                          <ArrowLeftRight className="h-2.5 w-2.5" />
                          {t('pair_table.cross_course_badge')}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Cross-course</TooltipContent>
                    </Tooltip>
                  )}
                  {p.cross_assignment && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {t('pair_table.cross_assignment_badge')}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Cross-assignment</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label={t('pair_table.open_detail')}
                  data-testid={`pair-row-${p.id}-open`}
                >
                  <Link to={`/plagiarism-runs/${runId}/pairs/${p.id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default PairTable;
