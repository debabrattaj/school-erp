// A complete 5-day, 6-period week for each section.
export function sampleAssignments() {
  const subjects = [
    ['Maths', 'A. Das', 6],
    ['English', 'R. Singh', 5],
    ['Science', 'M. Rao', 5],
    ['Social Studies', 'P. Sen', 4],
    ['Second Language', 'N. Mishra', 5],
    ['Computer Lab', 'S. Patel', 2],
    ['Physical Education', 'K. Roy', 2],
    ['Art', 'D. Bose', 1],
  ];
  return ['6-A', '6-B'].flatMap(section => subjects.map(([subject, teacher, count]) => ({
    section, subject, teacher, count,
    block: subject === 'Computer Lab' ? 2 : 1,
    room: subject === 'Computer Lab' ? 'Lab 1' : '',
    fixed: '', unavailable: '',
  })));
}
