import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreBand, contrastingText} from '../frontend/src/config/reportCardColors.js';

test('score bands and exemptions agree with the PDF rules', () => {
  for(const [score,band] of [[95,'top'],[90,'top'],[89.99,'passed'],[75,'passed'],[74.99,'average'],[40,'average'],[39.99,'failed']]) {
    assert.equal(scoreBand({marks_obtained:score,max_marks:100}),band);
  }
  assert.equal(scoreBand({marks_obtained:95,max_marks:100,percentage:35}),'failed');
  assert.equal(scoreBand({marks_obtained:95,max_marks:100,grade:'F'}),'failed');
  assert.equal(scoreBand({marks_obtained:95,max_marks:100},96),'failed');
  assert.equal(scoreBand({marks_obtained:0,max_marks:100,assessment_status:'Exempt'}),null);
  assert.equal(scoreBand({marks_obtained:0,max_marks:0}),null);
});
test('chosen colours receive readable black or white text', () => {
  assert.equal(contrastingText('#ffffff'),'#000000');
  assert.equal(contrastingText('#000000'),'#ffffff');
});
