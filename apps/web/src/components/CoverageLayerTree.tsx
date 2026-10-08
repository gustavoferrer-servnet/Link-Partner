import { ChevronDown, ChevronRight, Eye, EyeOff, FolderOpen, Layers3 } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { coverageSourceLayers, type CoverageLayer } from '../lib/coverageFiles';
import type { SupplierCoverage } from '../types';
import './CoverageLayerTree.css';

interface CoverageTreeNode {
  id: string;
  name: string;
  children: CoverageTreeNode[];
  layer?: CoverageLayer;
  layerIds: string[];
}

interface CoverageLayerTreeProps {
  coverages: SupplierCoverage[];
  hiddenLayerIds: Set<string>;
  compact?: boolean;
  onToggleLayerIds: (layerIds: string[]) => void;
}

interface SupplierCoverageGroup {
  supplierId: string;
  supplierName: string;
  color: string;
  coverages: SupplierCoverage[];
  layers: CoverageLayer[];
  tree: CoverageTreeNode[];
}

function makeTree(layers: CoverageLayer[]) {
  const roots: CoverageTreeNode[] = [];

  for (const layer of layers) {
    const path = layer.path?.length ? layer.path : [layer.name];
    let siblings = roots;
    let parentPath: string[] = [];

    path.forEach((name, index) => {
      parentPath = [...parentPath, name];
      const id = `${layer.supplierId || 'supplier'}:${parentPath.join('\u001f')}`;
      let node = siblings.find((candidate) => candidate.id === id);
      if (!node) {
        node = { id, name, children: [], layerIds: [] };
        siblings.push(node);
      }
      if (index === path.length - 1) node.layer = layer;
      if (!node.layerIds.includes(layer.id)) node.layerIds.push(layer.id);
      siblings = node.children;
    });
  }

  return roots;
}

function isServnetCoverage(coverage: Pick<SupplierCoverageGroup, 'supplierId' | 'supplierName'>) {
  const supplierId = coverage.supplierId.trim().toLocaleLowerCase('es-MX');
  const supplierName = coverage.supplierName.trim().toLocaleLowerCase('es-MX');
  return supplierId === 'sup-servnet' || supplierName === 'servnet' || supplierName === 'red servnet';
}

function LayerNode({
  node,
  depth,
  hiddenLayerIds,
  onToggleLayerIds,
}: {
  node: CoverageTreeNode;
  depth: number;
  hiddenLayerIds: Set<string>;
  onToggleLayerIds: (ids: string[]) => void;
}) {
  const visibleCount = node.layerIds.filter((id) => !hiddenLayerIds.has(id)).length;
  const visible = visibleCount > 0;
  const fullyVisible = visibleCount === node.layerIds.length;
  const polygonCount = node.layer?.polygonCount ?? 0;

  return (
    <li>
      <button
        className={`coverage-tree__row${node.children.length ? ' coverage-tree__row--folder' : ''}`}
        style={{ '--layer-depth': depth } as CSSProperties}
        type="button"
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${node.name}`}
        aria-pressed={fullyVisible}
        data-partial={visible && !fullyVisible ? 'true' : undefined}
        onClick={() => onToggleLayerIds(node.layerIds)}
      >
        {visible ? <Eye size={14} /> : <EyeOff size={14} />}
        {node.children.length ? <FolderOpen size={14} /> : <i />}
        <span>{node.name}</span>
        <small>{node.children.length ? `${visibleCount}/${node.layerIds.length}` : `${node.layer?.featureCount ?? 0} elem.${polygonCount ? ` · ${polygonCount} pol.` : ''}`}</small>
      </button>
      {node.children.length ? (
        <ul>{node.children.map((child) => <LayerNode key={child.id} node={child} depth={depth + 1} hiddenLayerIds={hiddenLayerIds} onToggleLayerIds={onToggleLayerIds} />)}</ul>
      ) : null}
    </li>
  );
}

export function CoverageLayerTree({ coverages, hiddenLayerIds, compact = false, onToggleLayerIds }: CoverageLayerTreeProps) {
  const [collapsedSupplierIds, setCollapsedSupplierIds] = useState<Set<string>>(() => new Set());
  const suppliers = useMemo(() => {
    const groups = new Map<string, Omit<SupplierCoverageGroup, 'tree'>>();

    for (const coverage of coverages) {
      let group = groups.get(coverage.supplierId);
      if (!group) {
        group = {
          supplierId: coverage.supplierId,
          supplierName: coverage.supplierName,
          color: coverage.color,
          coverages: [],
          layers: [],
        };
        groups.set(coverage.supplierId, group);
      }
      group.coverages.push(coverage);
      group.layers.push(...coverageSourceLayers(coverage).map((layer) => ({
        ...layer,
        path: [coverage.sourceFileName, ...(layer.path?.length ? layer.path : [layer.name])],
      })));
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      coverages: [...group.coverages].sort((left, right) => left.sourceFileName.localeCompare(right.sourceFileName, 'es-MX')),
      tree: makeTree(group.layers),
    })).sort((left, right) => {
      const leftIsServnet = isServnetCoverage(left);
      const rightIsServnet = isServnetCoverage(right);
      if (leftIsServnet !== rightIsServnet) return leftIsServnet ? -1 : 1;
      return left.supplierName.localeCompare(right.supplierName, 'es-MX');
    });
  }, [coverages]);

  function toggleSupplierCollapsed(coverageId: string) {
    setCollapsedSupplierIds((current) => {
      const next = new Set(current);
      if (next.has(coverageId)) next.delete(coverageId);
      else next.add(coverageId);
      return next;
    });
  }

  return (
    <div className={`coverage-tree${compact ? ' coverage-tree--compact' : ''}`}>
      {suppliers.map(({ supplierId, supplierName, color, coverages: supplierCoverages, layers, tree }) => {
        const layerIds = layers.map((layer) => layer.id);
        const visibleCount = layerIds.filter((id) => !hiddenLayerIds.has(id)).length;
        const visible = visibleCount > 0;
        const fullyVisible = visibleCount === layerIds.length;
        const collapsed = collapsedSupplierIds.has(supplierId);
        const nodesId = `coverage-tree-${supplierId}`;
        return (
          <section className="coverage-tree__supplier" key={supplierId}>
            <header className="coverage-tree__supplier-header" data-visible={visible ? 'true' : 'false'}>
              <button
                className="coverage-tree__supplier-visibility"
                type="button"
                aria-label={`${visible ? 'Ocultar' : 'Mostrar'} todas las capas de ${supplierName}`}
                aria-pressed={fullyVisible}
                data-partial={visible && !fullyVisible ? 'true' : undefined}
                onClick={() => onToggleLayerIds(layerIds)}
              >
                {visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                className="coverage-tree__supplier-row"
                type="button"
                aria-controls={nodesId}
                aria-expanded={!collapsed}
                onClick={() => toggleSupplierCollapsed(supplierId)}
              >
                <i style={{ backgroundColor: color }} />
                <span><strong>{supplierName}</strong><small>{supplierCoverages.length} {supplierCoverages.length === 1 ? 'archivo' : 'archivos'} · {layers.length} {layers.length === 1 ? 'capa' : 'capas'}</small></span>
                <Layers3 size={15} />
                {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>
            </header>
            {!collapsed ? <ul className="coverage-tree__nodes" id={nodesId}>{tree.map((node) => <LayerNode key={node.id} node={node} depth={0} hiddenLayerIds={hiddenLayerIds} onToggleLayerIds={onToggleLayerIds} />)}</ul> : null}
          </section>
        );
      })}
    </div>
  );
}
