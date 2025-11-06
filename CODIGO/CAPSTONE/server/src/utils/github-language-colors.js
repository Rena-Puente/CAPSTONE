const LANGUAGE_COLOR_MAP = new Map([
  ['assembly', '#6E4C13'],
  ['c', '#555555'],
  ['c#', '#178600'],
  ['c++', '#f34b7d'],
  ['clojure', '#db5855'],
  ['coffeescript', '#244776'],
  ['css', '#563d7c'],
  ['dart', '#00B4AB'],
  ['elixir', '#6E4A7E'],
  ['elm', '#60B5CC'],
  ['erlang', '#B83998'],
  ['f#', '#b845fc'],
  ['fortran', '#4d41b1'],
  ['go', '#00ADD8'],
  ['graphql', '#e10098'],
  ['groovy', '#4298b8'],
  ['haskell', '#5e5086'],
  ['html', '#e34c26'],
  ['java', '#b07219'],
  ['javascript', '#f1e05a'],
  ['julia', '#a270ba'],
  ['jupyter notebook', '#DA5B0B'],
  ['kotlin', '#A97BFF'],
  ['less', '#1d365d'],
  ['lua', '#000080'],
  ['makefile', '#427819'],
  ['matlab', '#e16737'],
  ['nim', '#ffc200'],
  ['objective-c', '#438eff'],
  ['objective-c++', '#6866fb'],
  ['ocaml', '#3be133'],
  ['pascal', '#E3F171'],
  ['perl', '#0298c3'],
  ['php', '#4F5D95'],
  ['powershell', '#012456'],
  ['prolog', '#74283c'],
  ['python', '#3572A5'],
  ['r', '#198CE7'],
  ['ruby', '#701516'],
  ['rust', '#DEA584'],
  ['sass', '#a53b70'],
  ['scala', '#c22d40'],
  ['scss', '#c6538c'],
  ['shell', '#89e051'],
  ['solidity', '#AA6746'],
  ['sql', '#e38c00'],
  ['swift', '#F05138'],
  ['typescript', '#3178c6'],
  ['vue', '#41b883'],
  ['yaml', '#cb171e']
]);

function resolveLanguageColor(languageName) {
  if (!languageName || typeof languageName !== 'string') {
    return null;
  }

  const normalized = languageName.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (LANGUAGE_COLOR_MAP.has(normalized)) {
    return LANGUAGE_COLOR_MAP.get(normalized);
  }

  return null;
}

module.exports = {
  resolveLanguageColor
};
