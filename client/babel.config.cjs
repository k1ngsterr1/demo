module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [function phosphorLeafImports({ types: t }) {
      return { visitor: { ImportDeclaration(path) {
        const node = path.node;
        if (node.source.value !== 'phosphor-react-native' || node.importKind === 'type') return;
        // Keep the public declaration types, but Metro should load only the icons
        // we use. The package barrel otherwise adds the entire icon catalogue.
        const icons = node.specifiers.filter(s => t.isImportSpecifier(s) && s.importKind !== 'type' && t.isIdentifier(s.imported) && s.imported.name.endsWith('Icon'));
        if (!icons.length) return;
        const other = node.specifiers.filter(s => !icons.includes(s));
        path.replaceWithMultiple([
          ...(other.length ? [t.importDeclaration(other, node.source)] : []),
          ...icons.map(s => t.importDeclaration([s], t.stringLiteral(`phosphor-react-native/src/icons/${s.imported.name.slice(0, -4)}`))),
        ]);
      } } };
    }],
  };
};
