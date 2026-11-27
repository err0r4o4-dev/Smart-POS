const directoryKeys = new Set(['q', 'category', 'filter', 'sort', 'page']);

export function shopDirectorySearch(params: URLSearchParams): string {
  const directory = new URLSearchParams();
  params.forEach((value, key) => {
    if (directoryKeys.has(key)) directory.append(key, value);
  });
  return directory.size ? `?${directory}` : '';
}
