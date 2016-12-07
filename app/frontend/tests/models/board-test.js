import DS from 'ember-data';
import Ember from 'ember';
import { test, moduleForModel } from 'ember-qunit';
import { describe, it, expect, beforeEach, afterEach, waitsFor, runs, stub } from 'frontend/tests/helpers/jasmine';
import { queryLog } from 'frontend/tests/helpers/ember_helper';
import CoughDrop from '../../app';
import persistence from '../../utils/persistence';
import modal from '../../utils/modal';
import Button from '../../utils/button';

describe('Board', function() {
  describe("icon_url_with_fallback", function() {
    it("should not error on null image_url", function() {
      var board = CoughDrop.store.createRecord('board', {});
      expect(board.get('icon_url_with_fallback')).toNotEqual("");
      expect(board.get('icon_url_with_fallback')).toNotEqual(null);
    });
    it("should return image_url if specified", function() {
      var board = CoughDrop.store.createRecord('board', {image_url: "http://pics.pic/pic.png"});
      expect(board.get('icon_url_with_fallback')).toEqual("http://pics.pic/pic.png");
    });
    it("should return fallback url if image_url is empty", function() {
      var board = CoughDrop.store.createRecord('board', {});
      expect(board.get('icon_url_with_fallback')).toEqual(board.fallback_image_url);
    });
    it("should automatically check for locally-stored data-uri on load");
  });

  describe("key_placeholder", function() {
    it("should stay in sync with the name attribute", function() {
      var board = CoughDrop.store.createRecord('board', {name: "Bacon"});
      expect(board.get('key_placeholder')).toEqual("bacon");
      board.set('name', 'Bacon and eggs');
      expect(board.get('key_placeholder')).toEqual("bacon-and-eggs");
      board.set('name', null);
      expect(board.get('key_placeholder')).toEqual("my-board");
      board.set('name', "");
      expect(board.get('key_placeholder')).toEqual("my-board");
    });
    it("should strip out non-key characters from the name attribute", function() {
      var board = CoughDrop.store.createRecord('board', {name: "Bacon!"});
      expect(board.get('key_placeholder')).toEqual("bacon");
      board.set('name', '!$%&$#&_$#%$&-$#%&#Bacon and *#$#$^*eggs____---@$%@');
      expect(board.get('key_placeholder')).toEqual("-_-bacon-and-eggs____");
    });
  });

  describe("create_copy", function() {
    it("should make a copy", function() {
      var board = CoughDrop.store.createRecord('board', {
        id: 'asdf',
        key: 'bob/asdf',
        name: 'cool stuff'
      });
      var record = null;
      queryLog.defineFixture({
        method: 'POST',
        type: 'board',
        response: Ember.RSVP.resolve({board: {id: '134', key: 'cookie'}}),
        compare: function(object) {
          record = object;
          return object.get('parent_board_id') == 'asdf';
        }
      });
      var copy = board.create_copy();
      expect(copy.then).toNotEqual(undefined);
      waitsFor(function() { return record; });
      runs(function() {
        expect(record.get('key')).toEqual('cookie');
        expect(record.get('name')).toEqual('cool stuff');
      });
    });
  });

  describe("labels", function() {
    it("should not error on empty grid or buttons", function() {
      var board = CoughDrop.store.createRecord('board', {});
      expect(board.get('labels')).toEqual("");
    });

    it("should return list of labels on specified buttons", function() {
      var board = CoughDrop.store.createRecord('board', {
        buttons: [
          {id: 1, label: "hat"},
          {id: 2, label: "car"}
        ],
        grid: {
          rows: 2,
          columns: 2,
          order: [[1,2],[2,2]]
        }
      });
      expect(board.get('labels')).toEqual("hat, car, car, car");
    });

    it("should skip empty buttons", function() {
      var board = CoughDrop.store.createRecord('board', {
        buttons: [
          {id: 1, label: "hat"},
          {id: 2, label: "car"},
          {id: 3}
        ],
        grid: {
          rows: 2,
          columns: 2,
          order: [[1,2],[null,3]]
        }
      });
      expect(board.get('labels')).toEqual("hat, car");
    });
  });

  describe("star/unstar", function() {
    it("should make the appropriate call to star a board", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        expect(url).toEqual('/api/v1/boards/123/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('POST');
        return Ember.RSVP.resolve({starred: true, stars: 4});
      });
      var board = CoughDrop.store.createRecord('board', {id: '123'});
      expect(board.get('starred')).not.toEqual(true);
      board.star();
      expect(called).toEqual(true);
      waitsFor(function() { return board.get('starred'); });
      runs(function() {
        expect(board.get('starred')).toEqual(true);
        expect(board.get('stars')).toEqual(4);
      });
    });

    it("should make the appropriate call to unstar a board", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        expect(url).toEqual('/api/v1/boards/1234/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('DELETE');
        return Ember.RSVP.resolve({starred: false, stars: 2});
      });
      var board = CoughDrop.store.createRecord('board', {id: '1234', starred: true});
      expect(board.get('starred')).toEqual(true);
      board.unstar();
      expect(called).toEqual(true);
      waitsFor(function() { return !board.get('starred'); });
      runs(function() {
        expect(board.get('starred')).toEqual(false);
        expect(board.get('stars')).toEqual(2);
      });
    });
    it("should update the board's star attributes after success", function() {
      var called = false;
      stub(persistence, 'ajax', function(url, opts) {
        called = true;
        expect(url).toEqual('/api/v1/boards/12345/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('POST');
        return Ember.RSVP.resolve({starred: true, stars: 4});
      });
      var board = CoughDrop.store.createRecord('board', {id: '12345', stars: 3});
      expect(board.get('stars')).toEqual(3);
      board.star();
      expect(called).toEqual(true);
      waitsFor(function() { return board.get('starred'); });
      runs(function() {
        expect(board.get('stars')).toEqual(4);
      });
    });
    it("should not vomit on API call failure", function() {
      var called = false;
      var text = null;
      stub(modal, 'flash', function(message) {
        called = true;
        text = message;
      });
      stub(persistence, 'ajax', function(url, opts) {
        expect(url).toEqual('/api/v1/boards/123456/stars');
        expect(opts.type).toEqual('POST');
        expect(opts.data._method).toEqual('POST');
        return Ember.RSVP.reject();
      });
      var board = CoughDrop.store.createRecord('board', {id: '123456', stars: 3});
      board.star();
      waitsFor(function() { return called; });
      runs(function() {
        expect(text).toEqual("Like action failed");
      });
    });
  });

  describe("add_button", function() {
    it("should add the button to the list", function() {
      var board = CoughDrop.store.createRecord('board');
      board.add_button(Button.create({id: 123}));
      expect(board.get('buttons').length).toEqual(1);
      expect(board.get('buttons')[0].id).toEqual(123);

      board.add_button(Button.create({id: 1234}));
      expect(board.get('buttons').length).toEqual(2);
      expect(board.get('buttons')[0].id).toEqual(123);
      expect(board.get('buttons')[1].id).toEqual(1234);
    });

    it("should generate a new, unique id if an existing button has that id", function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('buttons', [{
        id: 123, label: 'hat'
      }]);
      board.add_button(Button.create({id: 123, label: 'cat'}));
      expect(board.get('buttons').length).toEqual(2);
      expect(board.get('buttons')[0].id).toEqual(123);
      expect(board.get('buttons')[0].label).toEqual('hat');
      expect(board.get('buttons')[1].id).toEqual(124);
      expect(board.get('buttons')[1].label).toEqual('cat');

      board.add_button(Button.create({id: 123, label: 'rat'}));
      expect(board.get('buttons').length).toEqual(3);
      expect(board.get('buttons')[0].id).toEqual(123);
      expect(board.get('buttons')[0].label).toEqual('hat');
      expect(board.get('buttons')[1].id).toEqual(124);
      expect(board.get('buttons')[1].label).toEqual('cat');
      expect(board.get('buttons')[2].id).toEqual(125);
      expect(board.get('buttons')[2].label).toEqual('rat');
    });

    it("should return the id of the button as the result", function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('buttons', [{
        id: 123, label: 'hat'
      }]);
      expect(board.add_button(Button.create({id: 123, label: 'cat'}))).toEqual(124);
      expect(board.add_button(Button.create({id: 129, label: 'cat'}))).toEqual(129);
    });

    it("should add to the first empty spot it finds in the grid", function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('buttons', [{
        id: 123, label: 'hat'
      }]);
      board.set('grid', {
        order: [[1,2,null],[2,null,null]]
      });
      expect(board.add_button(Button.create({id: 123, label: 'cat'}))).toEqual(124);
      expect(board.get('grid').order).toEqual([[1,2,124],[2,null,null]]);
      expect(board.add_button(Button.create({id: 129, label: 'cat'}))).toEqual(129);
      expect(board.get('grid').order).toEqual([[1,2,124],[2,129,null]]);
    });
  });

  describe("multiple_copies", function() {
    it("should return the correct value", function() {
      var board = CoughDrop.store.createRecord('board');
      expect(board.get('multiple_copies')).toEqual(false);
      board.set('copies', 0);
      expect(board.get('multiple_copies')).toEqual(false);
      board.set('copies', 1);
      expect(board.get('multiple_copies')).toEqual(false);
      board.set('copies', 2);
      expect(board.get('multiple_copies')).toEqual(true);
      board.set('copies', 10);
      expect(board.get('multiple_copies')).toEqual(true);
    });
  });

  describe("button_visible", function() {
    it("should return true if the id is in the grid order", function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('grid', {
        order: [[1,2,3],[2,3,4],[6,7,8]]
      });
      expect(board.button_visible(1)).toEqual(true);
      expect(board.button_visible(2)).toEqual(true);
      expect(board.button_visible(3)).toEqual(true);
      expect(board.button_visible(4)).toEqual(true);
      expect(board.button_visible(6)).toEqual(true);
      expect(board.button_visible(7)).toEqual(true);
      expect(board.button_visible(8)).toEqual(true);
    });

    it("should return false if the id is not in the grid order", function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('grid', {
        order: [[1,2,3],[2,3,4],[6,7,8]]
      });
      expect(board.button_visible(5)).toEqual(false);
      expect(board.button_visible(9)).toEqual(false);
      expect(board.button_visible('5')).toEqual(false);
      expect(board.button_visible('a')).toEqual(false);
      expect(board.button_visible(null)).toEqual(false);
    });

    it("should not error on malformed grid", function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('grid', {
        order: []
      });
      expect(board.button_visible(5)).toEqual(false);
      board.set('grid', {
        order: null
      });
      expect(board.button_visible(5)).toEqual(false);
    });
  });

  describe('find_content_locally', function() {
    it('should not run more than once', function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('fetched', true);
      var called = false;
      stub(persistence, 'push_records', function() { called = true; });
      var resolved = false;
      board.find_content_locally().then(function() {
        resolved = true;
      });
      waitsFor(function() { return resolved; });
      runs(function() {
        expect(called).toEqual(false);
      });
    });

    it('should return the existing pending promise if there is one', function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('fetch_promise', 'asdf');
      var called = false;
      var res = board.find_content_locally();
      expect(res).toEqual('asdf');
    });

    it('should push records into the data store when found', function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('buttons', [
        {id: 1, image_id: 'a', sound_id: 'c'},
        {id: 2},
        {id: 3, sound_id: 'b'},
        {id: 4}
      ]);
      var call_args = [];
      stub(persistence, 'push_records', function(type, ids) {
        call_args.push([type, ids]);
        return Ember.RSVP.resolve();
      });

      var resolved = false;
      board.find_content_locally().then(function() {
        resolved = true;
      });
      expect(board.get('fetch_promise')).not.toEqual(undefined);
      waitsFor(function() { return resolved; });
      runs(function() {
        expect(board.get('fetch_promise')).toEqual(null);
        expect(call_args).toEqual([
          ['image', ['a']],
          ['sound', ['c', 'b']]
        ]);
      });
    });

    it('should enable skipping individual findRecord calls because of batch push to save time', function() {
      var board = CoughDrop.store.createRecord('board');
      board.set('buttons', [
        {id: 1, image_id: 'a', sound_id: 'c'},
        {id: 2},
        {id: 3, sound_id: 'b'},
        {id: 4}
      ]);
      var call_args = [];
      stub(persistence, 'push_records', function(type, ids) {
        if(type == 'image') {
          CoughDrop.store.push({data: {type: 'image', id: 'a', attributes: {id: 'a', url: 'http://www.example.com/pic.png'}}});
        } else if(type == 'sound') {
          CoughDrop.store.push({data: {type: 'sound', id: 'b', attributes: {id: 'b', url: 'http://www.example.com/sound.mp3'}}});
          CoughDrop.store.push({data: {type: 'sound', id: 'c', attributes: {id: 'c', url: 'http://www.example.com/sound2.mp3'}}});
        }
        call_args.push([type, ids]);
        return Ember.RSVP.resolve();
      });

      var resolved = false;
      board.find_content_locally().then(function() {
        resolved = true;
      });
      expect(board.get('fetch_promise')).not.toEqual(undefined);

      var find_called = false;
      stub(CoughDrop.store, 'findRecord', function(a1, a2, a3) {
        find_called = true;
        return Ember.RSVP.reject();
      });

      waitsFor(function() { return resolved; });
      runs(function() {
        expect(board.get('fetch_promise')).toEqual(undefined);
        expect(call_args).toEqual([
          ['image', ['a']],
          ['sound', ['c', 'b']]
        ]);

        var buttons = [];
        board.get('buttons').forEach(function(b) {
          buttons.push(Button.create(b));
        });
        board.set('pending_buttons', buttons);
      });
      waitsFor(function() { return board.get('pending_buttons') && board.get('all_ready'); });
      runs(function() {
        expect(find_called).toEqual(false);
      });
    });
  });

  describe("load_button_set", function() {
    it('should return the set value if already set', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('button_set', 'asdf');
      var res = null;
      b.load_button_set().then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual('asdf');
      });
    });

    it('should return the peeked value if found', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('id', '1234');
      stub(CoughDrop.store, 'peekRecord', function(type, id) {
        if(type == 'buttonset' && id == '1234') {
          return 'asdf';
        }
      });
      var res = null;
      b.load_button_set().then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual('asdf');
      });
    });

    it('should return the peeked value for a linked board if found', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('id', '1234');
      var bs1 = Ember.Object.create({board_ids: ['1234'], fresh: true});
      var bs2 = Ember.Object.create({board_ids: ['2345'], fresh: true});
      stub(CoughDrop.store, 'peekAll', function(type) {
        if(type == 'buttonset') {
          return {
            content: [
              {record: bs1},
              {record: bs2}
            ]
          };
        }
      });
      var res = null;
      b.load_button_set().then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual(bs1);
      });
    });

    it('should not return the peeked value for a linked board if it is not fresh', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('id', '1234');
      var bs1 = Ember.Object.create({board_ids: ['1234'], fresh: false});
      var bs2 = Ember.Object.create({board_ids: ['2345', '1234'], fresh: true});
      stub(CoughDrop.store, 'peekAll', function(type) {
        if(type == 'buttonset') {
          return {
            content: [
              {record: bs1},
              {record: bs2}
            ]
          };
        }
      });
      var res = null;
      b.load_button_set().then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual(bs2);
      });
    });

    it('should try to find the record if not found other ways', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('id', '1234');
      var bs1 = Ember.Object.create({board_ids: ['1234'], fresh: true});
      stub(CoughDrop.store, 'findRecord', function(type, id) {
        if(type == 'buttonset' && id == '1234') {
          return Ember.RSVP.resolve(bs1);
        }
      });
      var res = null;
      b.load_button_set().then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual(bs1);
      });
    });

    it('should reload the record if found but not fresh', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('id', '1234');
      b.set('fresh', true);
      var bs1 = Ember.Object.create({board_ids: ['1234'], fresh: false});
      var reloaded = false;
      stub(bs1, 'reload', function() { reloaded = true; return Ember.RSVP.resolve(bs1); });
      stub(CoughDrop.store, 'findRecord', function(type, id) {
        if(type == 'buttonset' && id == '1234') {
          return Ember.RSVP.resolve(bs1);
        }
      });
      var res = null;
      b.load_button_set().then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual(bs1);
        expect(reloaded).toEqual(true);
      });
    });

    it('should reload if force is called, regardless of other factors', function() {
      var b = CoughDrop.store.createRecord('board');
      b.set('id', '1234');
      b.set('button_set', 'asdf');
      stub(CoughDrop.store, 'peekRecord', function(type, id) {
        return 'asdf';
      });
      var bs1 = Ember.Object.create({board_ids: ['1234'], fresh: false});
      stub(CoughDrop.store, 'peekAll', function(type) {
        if(type == 'buttonset') {
          return {
            content: [
              {record: bs1}
            ]
          };
        }
      });
      var reloaded = false;
      stub(bs1, 'reload', function() { reloaded = true; return Ember.RSVP.resolve(bs1); });
      stub(CoughDrop.store, 'findRecord', function(type, id) {
        if(type == 'buttonset' && id == '1234') {
          return Ember.RSVP.resolve(bs1);
        }
      });
      var res = null;
      b.load_button_set(true).then(function(r) { res = r; });
      waitsFor(function() { return res; });
      runs(function() {
        expect(res).toEqual(bs1);
        expect(reloaded).toEqual(true);
      });
    });
  });
});
